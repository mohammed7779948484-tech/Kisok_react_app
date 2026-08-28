-- KIOSK Database V2 Lean · 07 one atomic Customer checkout RPC.
-- No server Cart, no reconciliation RPC, no wrapper/private split.
-- Keeps the safeguards that matter even for one kiosk: auth, idempotency,
-- deterministic stock locking, stock validation, immutable snapshots + ledger.

create function public.create_order(
  client_request_id uuid,
  items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  item jsonb;
  parsed_variant_id uuid;
  parsed_quantity bigint;
  normalized_items jsonb := '[]'::jsonb;
  requested_count integer;
  distinct_count integer;
  computed_fingerprint text;
  existing_order public.orders%rowtype;
  conflict_items jsonb;
  saved_order public.orders%rowtype;
  random_bytes bytea;
  display_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate_display_number text;
  violated_constraint text;
  attempt_no integer;
  byte_pos integer;
begin
  select p.id into actor_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.role = 'customer'
    and p.is_active;

  if actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'An active Customer profile is required.';
  end if;

  if create_order.client_request_id is null
     or create_order.items is null
     or pg_catalog.jsonb_typeof(create_order.items) <> 'array'
     or pg_catalog.jsonb_array_length(create_order.items) = 0
     or pg_catalog.jsonb_array_length(create_order.items) > 100 then
    raise exception using
      errcode = 'K1001',
      message = 'The checkout request is invalid.';
  end if;

  for item in
    select value from pg_catalog.jsonb_array_elements(create_order.items)
  loop
    if pg_catalog.jsonb_typeof(item) <> 'object'
       or not (item ? 'variant_id')
       or not (item ? 'quantity')
       or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(item)) <> 2
       or pg_catalog.jsonb_typeof(item -> 'variant_id') <> 'string'
       or pg_catalog.jsonb_typeof(item -> 'quantity') <> 'number'
       or (item ->> 'quantity') !~ '^[0-9]+$' then
      raise exception using
        errcode = 'K1001',
        message = 'The checkout request is invalid.';
    end if;

    begin
      parsed_variant_id := (item ->> 'variant_id')::uuid;
      parsed_quantity := (item ->> 'quantity')::bigint;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using
          errcode = 'K1001',
          message = 'The checkout request is invalid.';
    end;

    if parsed_quantity <= 0 or parsed_quantity > 2147483647 then
      raise exception using
        errcode = 'K1001',
        message = 'The checkout request is invalid.';
    end if;

    normalized_items := normalized_items || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'variant_id', parsed_variant_id,
        'quantity', parsed_quantity::integer
      )
    );
  end loop;

  select pg_catalog.count(*),
         pg_catalog.count(distinct r.variant_id)
  into requested_count, distinct_count
  from pg_catalog.jsonb_to_recordset(normalized_items)
    as r(variant_id uuid, quantity integer);

  if requested_count <> distinct_count then
    raise exception using
      errcode = 'K1001',
      message = 'The checkout request contains duplicate Variants.';
  end if;

  select 'kiosk.checkout.lean.v1' || E'\n' ||
         pg_catalog.string_agg(
           r.variant_id::text || ':' || r.quantity::text,
           E'\n' order by r.variant_id
         )
  into computed_fingerprint
  from pg_catalog.jsonb_to_recordset(normalized_items)
    as r(variant_id uuid, quantity integer);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(create_order.client_request_id::text, 0)
  );

  select o.* into existing_order
  from public.orders o
  where o.client_request_id = create_order.client_request_id
  for update;

  if found then
    if existing_order.created_by <> actor_id
       or existing_order.request_fingerprint <> computed_fingerprint then
      raise exception using
        errcode = 'K1003',
        message = 'The checkout request conflicts with an existing request.';
    end if;

    return pg_catalog.jsonb_build_object(
      'kind', 'success',
      'order_id', existing_order.id,
      'display_number', existing_order.display_number,
      'created_at', existing_order.created_at
    );
  end if;

  -- Final catalog validation happens inside the same transaction immediately
  -- before stock locking. Categories do not gate checkout in the Lean design.
  if (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_to_recordset(normalized_items)
      as r(variant_id uuid, quantity integer)
    join public.product_variants v on v.id = r.variant_id
    join public.products p on p.id = v.product_id
    left join public.brands b on b.id = p.brand_id
    where v.is_active
      and p.is_active
      and (p.brand_id is null or b.is_active)
      and not exists (
        select 1
        from public.variant_option_values vov
        join public.option_types ot on ot.id = vov.option_type_id
        join public.option_values ov on ov.id = vov.option_value_id
        where vov.variant_id = v.id
          and (not ot.is_active or not ov.is_active)
      )
  ) <> requested_count then
    raise exception using
      errcode = 'K1002',
      message = 'One or more requested Variants are unavailable.';
  end if;

  perform i.variant_id
  from public.inventory i
  join pg_catalog.jsonb_to_recordset(normalized_items)
    as r(variant_id uuid, quantity integer)
    on r.variant_id = i.variant_id
  order by i.variant_id
  for update of i;

  if (
    select pg_catalog.count(*)
    from public.inventory i
    join pg_catalog.jsonb_to_recordset(normalized_items)
      as r(variant_id uuid, quantity integer)
      on r.variant_id = i.variant_id
  ) <> requested_count then
    raise exception using
      errcode = 'K1002',
      message = 'One or more requested Variants are unavailable.';
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'variant_id', r.variant_id,
      'requested_quantity', r.quantity,
      'available_quantity', i.current_quantity
    )
    order by r.variant_id
  )
  into conflict_items
  from pg_catalog.jsonb_to_recordset(normalized_items)
    as r(variant_id uuid, quantity integer)
  join public.inventory i on i.variant_id = r.variant_id
  where i.current_quantity < r.quantity;

  if conflict_items is not null then
    return pg_catalog.jsonb_build_object(
      'kind', 'stock_conflict',
      'conflicts', conflict_items
    );
  end if;

  saved_order.id := null;

  for attempt_no in 1..32 loop
    random_bytes := extensions.gen_random_bytes(6);
    candidate_display_number := '';

    for byte_pos in 0..5 loop
      candidate_display_number := candidate_display_number || pg_catalog.substr(
        display_alphabet,
        (pg_catalog.get_byte(random_bytes, byte_pos) % 32) + 1,
        1
      );
    end loop;

    begin
      insert into public.orders (
        display_number,
        client_request_id,
        request_fingerprint,
        status,
        created_by
      )
      values (
        candidate_display_number,
        create_order.client_request_id,
        computed_fingerprint,
        'new',
        actor_id
      )
      returning * into saved_order;
      exit;
    exception
      when unique_violation then
        get stacked diagnostics violated_constraint = constraint_name;
        if violated_constraint <> 'orders_display_number_key' then
          raise;
        end if;
    end;
  end loop;

  if saved_order.id is null then
    raise exception using
      errcode = 'K1006',
      message = 'The order could not be created.';
  end if;

  insert into public.order_items (
    order_id,
    product_id,
    variant_id,
    product_name,
    variant_name,
    variant_sku,
    variant_options,
    brand_name,
    image_public_id,
    image_secure_url,
    quantity
  )
  select
    saved_order.id,
    p.id,
    v.id,
    p.name,
    coalesce(
      v.title_override,
      (
        select pg_catalog.string_agg(
          ov.value,
          ' · ' order by ot.display_order, ov.display_order, ov.id
        )
        from public.variant_option_values vov
        join public.option_types ot on ot.id = vov.option_type_id
        join public.option_values ov on ov.id = vov.option_value_id
        where vov.variant_id = v.id
      )
    ),
    v.sku,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'type', ot.name,
          'value', ov.value
        )
        order by ot.display_order, ov.display_order, ov.id
      )
      from public.variant_option_values vov
      join public.option_types ot on ot.id = vov.option_type_id
      join public.option_values ov on ov.id = vov.option_value_id
      where vov.variant_id = v.id
    ), '[]'::jsonb),
    b.name,
    coalesce(vm.public_id, cover.public_id),
    coalesce(vm.secure_url, cover.secure_url),
    r.quantity
  from pg_catalog.jsonb_to_recordset(normalized_items)
    as r(variant_id uuid, quantity integer)
  join public.product_variants v on v.id = r.variant_id
  join public.products p on p.id = v.product_id
  left join public.brands b on b.id = p.brand_id
  left join lateral (
    select m.public_id, m.secure_url
    from public.product_variant_media pvm
    join public.media_assets m on m.id = pvm.media_asset_id
    where pvm.variant_id = v.id
    order by pvm.is_primary desc, pvm.display_order, pvm.media_asset_id
    limit 1
  ) vm on true
  left join public.media_assets cover on cover.id = p.cover_media_asset_id
  order by v.id;

  with requested as (
    select r.variant_id, r.quantity
    from pg_catalog.jsonb_to_recordset(normalized_items)
      as r(variant_id uuid, quantity integer)
  ),
  updated as (
    update public.inventory i
    set current_quantity = i.current_quantity - requested.quantity
    from requested
    where i.variant_id = requested.variant_id
    returning
      i.variant_id,
      requested.quantity,
      i.current_quantity + requested.quantity as quantity_before,
      i.current_quantity as quantity_after
  )
  insert into public.inventory_adjustments (
    variant_id,
    quantity_change,
    quantity_before,
    quantity_after,
    adjustment_type,
    reason,
    created_by,
    order_id
  )
  select
    u.variant_id,
    -u.quantity,
    u.quantity_before,
    u.quantity_after,
    'order_deduction',
    null,
    actor_id,
    saved_order.id
  from updated u
  order by u.variant_id;

  return pg_catalog.jsonb_build_object(
    'kind', 'success',
    'order_id', saved_order.id,
    'display_number', saved_order.display_number,
    'created_at', saved_order.created_at
  );
exception
  when numeric_value_out_of_range then
    raise exception using
      errcode = 'K1006',
      message = 'The order could not be created.';
end;
$$;

revoke all on function public.create_order(uuid, jsonb)
from public, anon, authenticated;
