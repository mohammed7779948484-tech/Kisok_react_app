-- KIOSK Database V2 Lean · 13 RLS, grants, final privilege surface.

alter table public.profiles enable row level security;
alter table public.media_assets enable row level security;
alter table public.store_settings enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.option_types enable row level security;
alter table public.option_values enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_variants enable row level security;
alter table public.variant_option_values enable row level security;
alter table public.product_variant_media enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_adjustments enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Profiles intentionally have no authenticated table policy. Startup identity
-- goes through current_active_profile(); Admin user management goes through the
-- service-role Edge Function.

create policy store_settings_internal_select
on public.store_settings for select to authenticated
using (
  exists (
    select 1 from public.current_active_profile() p
    where p.role in ('admin','preparation')
  )
);

create policy store_settings_admin_update
on public.store_settings for update to authenticated
using (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
)
with check (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
);

-- Catalog + Media are directly managed by Admin. Customers receive only the
-- get_customer_catalog() snapshot and therefore need no raw table policies.
create policy media_assets_admin_all
on public.media_assets for all to authenticated
using (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
)
with check (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
);

create policy brands_admin_all
on public.brands for all to authenticated
using (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
)
with check (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
);

create policy categories_admin_all
on public.categories for all to authenticated
using (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
)
with check (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
);

create policy option_types_admin_all
on public.option_types for all to authenticated
using (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
)
with check (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
);

create policy option_values_admin_all
on public.option_values for all to authenticated
using (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
)
with check (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
);

create policy products_admin_all
on public.products for all to authenticated
using (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
)
with check (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
);

create policy product_categories_admin_all
on public.product_categories for all to authenticated
using (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
)
with check (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
);

create policy product_variants_admin_all
on public.product_variants for all to authenticated
using (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
)
with check (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
);

create policy variant_option_values_admin_all
on public.variant_option_values for all to authenticated
using (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
)
with check (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
);

create policy product_variant_media_admin_all
on public.product_variant_media for all to authenticated
using (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
)
with check (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
);

create policy inventory_admin_select
on public.inventory for select to authenticated
using (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
);

create policy inventory_adjustments_admin_select
on public.inventory_adjustments for select to authenticated
using (
  exists (select 1 from public.current_active_profile() p where p.role = 'admin')
);

-- Preparation is trusted internal staff and can read the operational queue and
-- immutable item snapshots directly. Mutations remain RPC-only.
create policy orders_internal_select
on public.orders for select to authenticated
using (
  exists (
    select 1 from public.current_active_profile() p
    where p.role in ('admin','preparation')
  )
);

create policy order_items_internal_select
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.current_active_profile() p
    where p.role in ('admin','preparation')
  )
);

-- ---------------------------------------------------------------- privileges
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated, service_role;

-- Existing Supabase projects can have broad public-schema grants inherited
-- from platform default privileges. Reset the current object surface first;
-- RLS is a second gate, not a replacement for least-privilege grants.
revoke all privileges on all tables in schema public
from anon, authenticated, service_role;
revoke all privileges on all sequences in schema public
from anon, authenticated, service_role;
revoke execute on all functions in schema public
from public, anon, authenticated, service_role;
revoke execute on all functions in schema private
from public, anon, authenticated, service_role;

-- Shared DB role needs SELECT grants; RLS narrows rows by application role.
grant select on table
  public.store_settings,
  public.media_assets,
  public.brands,
  public.categories,
  public.option_types,
  public.option_values,
  public.products,
  public.product_categories,
  public.product_variants,
  public.variant_option_values,
  public.product_variant_media,
  public.inventory,
  public.inventory_adjustments,
  public.orders,
  public.order_items
to authenticated;

grant update (
  store_name,
  logo_media_asset_id,
  global_low_stock_threshold,
  customer_success_reset_seconds,
  store_timezone
) on public.store_settings to authenticated;

grant insert (name, image_media_asset_id, is_active)
  on public.brands to authenticated;
grant update (name, image_media_asset_id, is_active)
  on public.brands to authenticated;
grant delete on public.brands to authenticated;

grant insert (name, parent_id, image_media_asset_id, is_active)
  on public.categories to authenticated;
grant update (name, parent_id, image_media_asset_id, is_active)
  on public.categories to authenticated;
grant delete on public.categories to authenticated;

grant insert (name, is_active) on public.option_types to authenticated;
grant update (name, is_active) on public.option_types to authenticated;
grant delete on public.option_types to authenticated;

grant insert (option_type_id, value, is_active)
  on public.option_values to authenticated;
grant update (value, is_active) on public.option_values to authenticated;
grant delete on public.option_values to authenticated;

grant insert (
  name, brand_id, cover_media_asset_id, short_description,
  search_keywords, is_featured, is_active
) on public.products to authenticated;
grant update (
  name, brand_id, cover_media_asset_id, short_description,
  search_keywords, is_featured, is_active
) on public.products to authenticated;
grant delete on public.products to authenticated;

grant insert (product_id, category_id)
  on public.product_categories to authenticated;
grant delete on public.product_categories to authenticated;

grant insert (
  product_id, barcode, title_override, search_keywords,
  is_active, low_stock_threshold
) on public.product_variants to authenticated;
grant update (
  barcode, title_override, search_keywords, is_active, low_stock_threshold
) on public.product_variants to authenticated;
grant delete on public.product_variants to authenticated;

grant insert (variant_id, option_type_id, option_value_id)
  on public.variant_option_values to authenticated;
grant update (option_value_id)
  on public.variant_option_values to authenticated;
grant delete on public.variant_option_values to authenticated;

grant insert (variant_id, media_asset_id, is_primary)
  on public.product_variant_media to authenticated;
grant update (is_primary)
  on public.product_variant_media to authenticated;
grant delete on public.product_variant_media to authenticated;

-- Upsert from the authenticated Admin media handler may mention identity
-- columns; the identity trigger permits same-value writes and rejects changes.
grant insert (
  public_id, secure_url, asset_id, width, height, format, bytes
) on public.media_assets to authenticated;
grant update (
  public_id, secure_url, asset_id, width, height, format, bytes
) on public.media_assets to authenticated;
grant delete on public.media_assets to authenticated;

revoke all on table public.profiles from authenticated;

-- Direct Admin inserts rely on DB-owned defaults.
grant usage on sequence public.display_order_seq,
  public.product_variant_sku_seq
to authenticated, service_role;

-- Index expressions and service-role profile mutation use these harmless
-- deterministic normalizers.
grant usage on schema private to authenticated, service_role;
grant execute on function private.normalize_label(text),
  private.normalize_option_value(text)
to authenticated, service_role;

-- Final explicit RPC surface.
grant execute on function public.current_active_profile(),
  public.get_customer_catalog(),
  public.create_order(uuid, jsonb),
  public.update_order_status(uuid, public.order_status, text),
  public.apply_inventory_adjustment(uuid, public.inventory_adjustment_type, integer, text),
  public.set_inventory_quantity(uuid, integer, text),
  public.get_media_asset_usage(uuid),
  public.reorder_items(text, uuid, uuid[])
to authenticated;

grant execute on function public.admin_update_profile(uuid, uuid, jsonb),
  public.search_admin_profiles(text, integer, integer)
to service_role;

-- Service role is the only broad bypass used by server-side Admin-user/media
-- infrastructure. RLS still protects all authenticated browser clients.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;
