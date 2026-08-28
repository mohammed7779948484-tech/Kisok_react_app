-- KIOSK Database V2 Lean · 09 Admin-only stock mutations.

create function public.apply_inventory_adjustment(
  variant_id uuid,
  type public.inventory_adjustment_type,
  delta integer,
  reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  normalized_reason text;
  quantity_before integer;
  quantity_after bigint;
  saved_id uuid;
  saved_at timestamptz;
begin
  select p.id into actor_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.role = 'admin'
    and p.is_active;

  if actor_id is null then
    raise exception using errcode = '42501',
      message = 'An active Admin profile is required.';
  end if;

  if apply_inventory_adjustment.variant_id is null
     or apply_inventory_adjustment.type is null
     or apply_inventory_adjustment.delta is null
     or apply_inventory_adjustment.delta = 0
     or apply_inventory_adjustment.type in ('order_deduction','order_cancellation_restoration') then
    raise exception using errcode = 'K1005',
      message = 'The inventory adjustment is invalid.';
  end if;

  normalized_reason := nullif(pg_catalog.btrim(apply_inventory_adjustment.reason), '');

  if apply_inventory_adjustment.type in ('manual_increase','manual_decrease','damaged_or_expired')
     and normalized_reason is null then
    raise exception using errcode = 'K1005',
      message = 'A reason is required.';
  end if;

  if (apply_inventory_adjustment.type in ('initial_stock','stock_received','manual_increase')
        and apply_inventory_adjustment.delta < 0)
     or
     (apply_inventory_adjustment.type in ('manual_decrease','damaged_or_expired')
        and apply_inventory_adjustment.delta > 0) then
    raise exception using errcode = 'K1005',
      message = 'The inventory adjustment direction is invalid.';
  end if;

  select i.current_quantity into quantity_before
  from public.inventory i
  where i.variant_id = apply_inventory_adjustment.variant_id
  for update;

  if not found then
    raise exception using errcode = 'K1002',
      message = 'Variant inventory is unavailable.';
  end if;

  if apply_inventory_adjustment.type = 'initial_stock'
     and (
       quantity_before <> 0
       or exists (
         select 1 from public.inventory_adjustments ia
         where ia.variant_id = apply_inventory_adjustment.variant_id
       )
     ) then
    raise exception using errcode = 'K1005',
      message = 'Initial Stock is only valid as the first stock event.';
  end if;

  quantity_after := quantity_before::bigint + apply_inventory_adjustment.delta::bigint;

  if quantity_after < 0 or quantity_after > 2147483647 then
    raise exception using errcode = 'K1005',
      message = 'The inventory change is outside the supported range.';
  end if;

  update public.inventory i
  set current_quantity = quantity_after::integer
  where i.variant_id = apply_inventory_adjustment.variant_id;

  insert into public.inventory_adjustments (
    variant_id, quantity_change, quantity_before, quantity_after,
    adjustment_type, reason, created_by, order_id
  )
  values (
    apply_inventory_adjustment.variant_id,
    apply_inventory_adjustment.delta,
    quantity_before,
    quantity_after::integer,
    apply_inventory_adjustment.type,
    normalized_reason,
    actor_id,
    null
  )
  returning id, created_at into saved_id, saved_at;

  return pg_catalog.jsonb_build_object(
    'adjustment_id', saved_id,
    'variant_id', apply_inventory_adjustment.variant_id,
    'quantity_before', quantity_before,
    'quantity_after', quantity_after::integer,
    'quantity_change', apply_inventory_adjustment.delta,
    'adjustment_type', apply_inventory_adjustment.type,
    'reason', normalized_reason,
    'created_at', saved_at
  );
end;
$$;

create function public.set_inventory_quantity(
  variant_id uuid,
  final_quantity integer,
  reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  normalized_reason text;
  quantity_before integer;
  quantity_delta bigint;
  resolved_type public.inventory_adjustment_type;
  saved_id uuid;
  saved_at timestamptz;
begin
  select p.id into actor_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.role = 'admin'
    and p.is_active;

  if actor_id is null then
    raise exception using errcode = '42501',
      message = 'An active Admin profile is required.';
  end if;

  normalized_reason := nullif(pg_catalog.btrim(set_inventory_quantity.reason), '');

  if set_inventory_quantity.variant_id is null
     or set_inventory_quantity.final_quantity is null
     or set_inventory_quantity.final_quantity < 0
     or normalized_reason is null then
    raise exception using errcode = 'K1005',
      message = 'The Set Quantity request is invalid.';
  end if;

  select i.current_quantity into quantity_before
  from public.inventory i
  where i.variant_id = set_inventory_quantity.variant_id
  for update;

  if not found then
    raise exception using errcode = 'K1002',
      message = 'Variant inventory is unavailable.';
  end if;

  quantity_delta := set_inventory_quantity.final_quantity::bigint - quantity_before::bigint;

  if quantity_delta = 0 then
    raise exception using errcode = 'K1005',
      message = 'Set Quantity must change the current quantity.';
  end if;

  if quantity_delta < -2147483647 or quantity_delta > 2147483647 then
    raise exception using errcode = 'K1005',
      message = 'The inventory change is outside the supported range.';
  end if;

  resolved_type := case when quantity_delta > 0
    then 'manual_increase'::public.inventory_adjustment_type
    else 'manual_decrease'::public.inventory_adjustment_type
  end;

  update public.inventory i
  set current_quantity = set_inventory_quantity.final_quantity
  where i.variant_id = set_inventory_quantity.variant_id;

  insert into public.inventory_adjustments (
    variant_id, quantity_change, quantity_before, quantity_after,
    adjustment_type, reason, created_by, order_id
  )
  values (
    set_inventory_quantity.variant_id,
    quantity_delta::integer,
    quantity_before,
    set_inventory_quantity.final_quantity,
    resolved_type,
    normalized_reason,
    actor_id,
    null
  )
  returning id, created_at into saved_id, saved_at;

  return pg_catalog.jsonb_build_object(
    'adjustment_id', saved_id,
    'variant_id', set_inventory_quantity.variant_id,
    'quantity_before', quantity_before,
    'quantity_after', set_inventory_quantity.final_quantity,
    'quantity_change', quantity_delta::integer,
    'adjustment_type', resolved_type,
    'reason', normalized_reason,
    'created_at', saved_at
  );
end;
$$;

revoke all on function
  public.apply_inventory_adjustment(uuid, public.inventory_adjustment_type, integer, text),
  public.set_inventory_quantity(uuid, integer, text)
from public, anon, authenticated;

