-- KIOSK · Customer catalog snapshot v2: each variant's sellable quantity.
--
-- v1 (get_customer_catalog) is left unchanged on purpose: installed clients
-- parse its shape strictly, so adding a field to v1 would break them. v2 reuses
-- v1 — and with it the active-Customer check and every visibility filter — and
-- only adds `available_quantity`: inventory.current_quantity, the same figure
-- create_order() validates against and deducts when an order is placed.
--
-- Both reads run inside one STABLE function call, so `is_available` (from v1)
-- and `available_quantity` come from the same snapshot and cannot disagree.

create function public.get_customer_catalog_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  payload jsonb;
begin
  payload := public.get_customer_catalog();

  return pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      payload,
      '{schema_version}',
      pg_catalog.to_jsonb('kiosk.catalog.lean.v2'::text)
    ),
    '{variants}',
    coalesce((
      select pg_catalog.jsonb_agg(
        entry.variant
          || pg_catalog.jsonb_build_object(
            'available_quantity', coalesce(i.current_quantity, 0)
          )
        order by entry.position
      )
      from pg_catalog.jsonb_array_elements(payload -> 'variants')
        with ordinality as entry(variant, position)
      left join public.inventory i
        on i.variant_id = (entry.variant ->> 'id')::uuid
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_customer_catalog_v2() is
  'Customer catalog snapshot (kiosk.catalog.lean.v2): v1 plus each variant''s available_quantity.';

revoke all on function public.get_customer_catalog_v2()
from public, anon, authenticated;

grant execute on function public.get_customer_catalog_v2() to authenticated;
