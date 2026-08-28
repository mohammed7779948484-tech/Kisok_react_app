-- KIOSK Database V2 Lean · 10 small Admin utilities only.

create function public.get_media_asset_usage(target_media_asset_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  resolved_public_id text;
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

  if target_media_asset_id is null then
    raise exception 'target_media_asset_id is required'
      using errcode = 'invalid_parameter_value';
  end if;

  select m.public_id into resolved_public_id
  from public.media_assets m
  where m.id = target_media_asset_id;

  if not found then
    raise exception 'media asset does not exist'
      using errcode = 'foreign_key_violation';
  end if;

  return pg_catalog.jsonb_build_object(
    'store_settings_logo', (
      select pg_catalog.count(*) from public.store_settings s
      where s.logo_media_asset_id = target_media_asset_id
    ),
    'brands', (
      select pg_catalog.count(*) from public.brands b
      where b.image_media_asset_id = target_media_asset_id
    ),
    'categories', (
      select pg_catalog.count(*) from public.categories c
      where c.image_media_asset_id = target_media_asset_id
    ),
    'product_covers', (
      select pg_catalog.count(*) from public.products p
      where p.cover_media_asset_id = target_media_asset_id
    ),
    'variant_media', (
      select pg_catalog.count(*) from public.product_variant_media vm
      where vm.media_asset_id = target_media_asset_id
    ),
    'order_items_historical', (
      select pg_catalog.count(*) from public.order_items oi
      where oi.image_public_id = resolved_public_id
    )
  );
end;
$$;

revoke all on function public.get_media_asset_usage(uuid)
from public, anon, authenticated;
