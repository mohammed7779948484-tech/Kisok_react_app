-- KIOSK Database V2 Lean · 06 one Customer catalog snapshot.
-- Flutter already performs brand/category/search/detail filtering locally.
-- Customer gets no raw catalog-table SELECT access.

create function public.get_customer_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  payload jsonb;
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

  with valid_variants as (
    select v.*
    from public.product_variants v
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
  ),
  valid_products as (
    select distinct p.*
    from public.products p
    join valid_variants v on v.product_id = p.id
  ),
  valid_categories as (
    select c.*
    from public.categories c
    left join public.categories parent on parent.id = c.parent_id
    where c.is_active
      and (c.parent_id is null or parent.is_active)
  ),
  used_brands as (
    select b.*
    from public.brands b
    where b.is_active
      and exists (
        select 1 from valid_products p where p.brand_id = b.id
      )
  ),
  used_categories as (
    select distinct c.*
    from valid_categories c
    where exists (
      select 1
      from public.product_categories pc
      join valid_products p on p.id = pc.product_id
      where pc.category_id = c.id
    )
    or exists (
      select 1
      from valid_categories child
      join public.product_categories pc on pc.category_id = child.id
      join valid_products p on p.id = pc.product_id
      where child.parent_id = c.id
    )
  ),
  used_option_types as (
    select distinct ot.*
    from public.option_types ot
    join public.variant_option_values vov on vov.option_type_id = ot.id
    join valid_variants v on v.id = vov.variant_id
    where ot.is_active
  ),
  used_option_values as (
    select distinct ov.*
    from public.option_values ov
    join public.variant_option_values vov on vov.option_value_id = ov.id
    join valid_variants v on v.id = vov.variant_id
    where ov.is_active
  )
  select pg_catalog.jsonb_build_object(
    'schema_version', 'kiosk.catalog.lean.v1',

    'settings', coalesce((
      select pg_catalog.jsonb_build_object(
        'store_name', s.store_name,
        'global_low_stock_threshold', s.global_low_stock_threshold,
        'customer_success_reset_seconds', s.customer_success_reset_seconds,
        'store_timezone', s.store_timezone,
        'logo_media_asset_id', s.logo_media_asset_id,
        'logo_public_id', m.public_id,
        'logo_secure_url', m.secure_url
      )
      from public.store_settings s
      left join public.media_assets m on m.id = s.logo_media_asset_id
      where s.id
      limit 1
    ), '{}'::jsonb),

    'brands', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', b.id,
          'name', b.name,
          'image_media_asset_id', b.image_media_asset_id,
          'image_public_id', m.public_id,
          'image_secure_url', m.secure_url,
          'display_order', b.display_order
        )
        order by b.display_order, b.id
      )
      from used_brands b
      left join public.media_assets m on m.id = b.image_media_asset_id
    ), '[]'::jsonb),

    'categories', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'parent_id', c.parent_id,
          'image_media_asset_id', c.image_media_asset_id,
          'image_public_id', m.public_id,
          'image_secure_url', m.secure_url,
          'display_order', c.display_order
        )
        order by c.parent_id nulls first, c.display_order, c.id
      )
      from used_categories c
      left join public.media_assets m on m.id = c.image_media_asset_id
    ), '[]'::jsonb),

    'products', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'brand_id', p.brand_id,
          'cover_media_asset_id', p.cover_media_asset_id,
          'cover_public_id', m.public_id,
          'cover_secure_url', m.secure_url,
          'short_description', p.short_description,
          'search_keywords', p.search_keywords,
          'display_order', p.display_order,
          'is_featured', p.is_featured
        )
        order by p.display_order, p.id
      )
      from valid_products p
      left join public.media_assets m on m.id = p.cover_media_asset_id
    ), '[]'::jsonb),

    'product_categories', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'product_id', pc.product_id,
          'category_id', pc.category_id
        )
        order by pc.product_id, pc.category_id
      )
      from public.product_categories pc
      join valid_products p on p.id = pc.product_id
      join used_categories c on c.id = pc.category_id
    ), '[]'::jsonb),

    'option_types', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', ot.id,
          'name', ot.name,
          'display_order', ot.display_order
        )
        order by ot.display_order, ot.id
      )
      from used_option_types ot
    ), '[]'::jsonb),

    'option_values', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', ov.id,
          'option_type_id', ov.option_type_id,
          'value', ov.value,
          'display_order', ov.display_order
        )
        order by ov.option_type_id, ov.display_order, ov.id
      )
      from used_option_values ov
    ), '[]'::jsonb),

    'variants', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', v.id,
          'product_id', v.product_id,
          'sku', v.sku,
          'barcode', v.barcode,
          'title_override', v.title_override,
          'search_keywords', v.search_keywords,
          'display_order', v.display_order,
          'is_available', coalesce(i.current_quantity, 0) > 0
        )
        order by v.product_id, v.display_order, v.id
      )
      from valid_variants v
      left join public.inventory i on i.variant_id = v.id
    ), '[]'::jsonb),

    'variant_option_values', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'variant_id', vov.variant_id,
          'option_type_id', vov.option_type_id,
          'option_value_id', vov.option_value_id
        )
        order by vov.variant_id, ot.display_order, ov.display_order, vov.option_value_id
      )
      from public.variant_option_values vov
      join valid_variants v on v.id = vov.variant_id
      join public.option_types ot on ot.id = vov.option_type_id and ot.is_active
      join public.option_values ov on ov.id = vov.option_value_id and ov.is_active
    ), '[]'::jsonb),

    'variant_media', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'variant_id', vm.variant_id,
          'media_asset_id', vm.media_asset_id,
          'public_id', m.public_id,
          'secure_url', m.secure_url,
          'display_order', vm.display_order,
          'is_primary', vm.is_primary
        )
        order by vm.variant_id, vm.display_order, vm.media_asset_id
      )
      from public.product_variant_media vm
      join valid_variants v on v.id = vm.variant_id
      join public.media_assets m on m.id = vm.media_asset_id
    ), '[]'::jsonb)
  )
  into payload;

  return payload;
end;
$$;

revoke all on function public.get_customer_catalog()
from public, anon, authenticated;
