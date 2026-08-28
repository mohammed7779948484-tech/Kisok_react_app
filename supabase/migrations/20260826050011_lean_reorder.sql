-- KIOSK Database V2 Lean · 11 full-scope reorder.
-- One simple API replaces midpoint/gap/normalization machinery.
-- Caller sends the COMPLETE ordered id list for one scope.

create function public.reorder_items(
  resource_name text,
  scope_id uuid,
  ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  expected_count integer;
  supplied_count integer;
  matched_count integer;
  item_id uuid;
begin
  select p.id into actor_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.role = 'admin'
    and p.is_active;

  if actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'An active Admin profile is required.';
  end if;

  if ordered_ids is null or cardinality(ordered_ids) = 0 then
    raise exception 'ordered_ids must contain the complete non-empty scope'
      using errcode = 'invalid_parameter_value';
  end if;

  supplied_count := cardinality(ordered_ids);

  if (select pg_catalog.count(distinct value) from unnest(ordered_ids) value)
     <> supplied_count then
    raise exception 'ordered_ids contains duplicates'
      using errcode = 'invalid_parameter_value';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(
      'kiosk_reorder:' || resource_name || ':' || coalesce(scope_id::text, '-')
    )
  );

  if resource_name = 'brands' then
    if scope_id is not null then
      raise exception 'brands use a global scope'
        using errcode = 'invalid_parameter_value';
    end if;
    select pg_catalog.count(*) into expected_count from public.brands;
    select pg_catalog.count(*) into matched_count
    from public.brands b where b.id = any(ordered_ids);

  elsif resource_name = 'categories' then
    select pg_catalog.count(*) into expected_count
    from public.categories c
    where c.parent_id is not distinct from scope_id;
    select pg_catalog.count(*) into matched_count
    from public.categories c
    where c.id = any(ordered_ids)
      and c.parent_id is not distinct from scope_id;

  elsif resource_name = 'products' then
    if scope_id is not null then
      raise exception 'products use a global scope'
        using errcode = 'invalid_parameter_value';
    end if;
    select pg_catalog.count(*) into expected_count from public.products;
    select pg_catalog.count(*) into matched_count
    from public.products p where p.id = any(ordered_ids);

  elsif resource_name = 'option_types' then
    if scope_id is not null then
      raise exception 'option_types use a global scope'
        using errcode = 'invalid_parameter_value';
    end if;
    select pg_catalog.count(*) into expected_count from public.option_types;
    select pg_catalog.count(*) into matched_count
    from public.option_types ot where ot.id = any(ordered_ids);

  elsif resource_name = 'option_values' then
    if scope_id is null then
      raise exception 'option_values require option_type scope_id'
        using errcode = 'invalid_parameter_value';
    end if;
    select pg_catalog.count(*) into expected_count
    from public.option_values ov where ov.option_type_id = scope_id;
    select pg_catalog.count(*) into matched_count
    from public.option_values ov
    where ov.id = any(ordered_ids) and ov.option_type_id = scope_id;

  elsif resource_name = 'variants' then
    if scope_id is null then
      raise exception 'variants require product scope_id'
        using errcode = 'invalid_parameter_value';
    end if;
    select pg_catalog.count(*) into expected_count
    from public.product_variants v where v.product_id = scope_id;
    select pg_catalog.count(*) into matched_count
    from public.product_variants v
    where v.id = any(ordered_ids) and v.product_id = scope_id;

  elsif resource_name = 'variant_media' then
    if scope_id is null then
      raise exception 'variant_media require variant scope_id'
        using errcode = 'invalid_parameter_value';
    end if;
    select pg_catalog.count(*) into expected_count
    from public.product_variant_media vm where vm.variant_id = scope_id;
    select pg_catalog.count(*) into matched_count
    from public.product_variant_media vm
    where vm.media_asset_id = any(ordered_ids) and vm.variant_id = scope_id;

  else
    raise exception 'unsupported reorder resource'
      using errcode = 'invalid_parameter_value';
  end if;

  if expected_count <> supplied_count or matched_count <> supplied_count then
    raise exception 'ordered_ids must contain every item in the scope exactly once'
      using errcode = 'check_violation';
  end if;

  -- PL/pgSQL iteration preserves the caller's array order exactly.
  foreach item_id in array ordered_ids loop
    if resource_name = 'brands' then
      update public.brands set display_order = nextval('public.display_order_seq')
      where id = item_id;

    elsif resource_name = 'categories' then
      update public.categories set display_order = nextval('public.display_order_seq')
      where id = item_id;

    elsif resource_name = 'products' then
      update public.products set display_order = nextval('public.display_order_seq')
      where id = item_id;

    elsif resource_name = 'option_types' then
      update public.option_types set display_order = nextval('public.display_order_seq')
      where id = item_id;

    elsif resource_name = 'option_values' then
      update public.option_values set display_order = nextval('public.display_order_seq')
      where id = item_id;

    elsif resource_name = 'variants' then
      update public.product_variants set display_order = nextval('public.display_order_seq')
      where id = item_id;

    else
      update public.product_variant_media
      set display_order = nextval('public.display_order_seq')
      where variant_id = scope_id and media_asset_id = item_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.reorder_items(text, uuid, uuid[])
from public, anon, authenticated;
