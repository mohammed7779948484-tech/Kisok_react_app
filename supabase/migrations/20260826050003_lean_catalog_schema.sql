-- KIOSK Database V2 Lean · 03 catalog tables.
-- Admin edits catalog directly under RLS. No aggregate Product-save RPC.
-- display_order is a monotonic DB default; reorder_items rewrites a whole scope.

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (pg_catalog.btrim(name) <> ''),
  image_media_asset_id uuid references public.media_assets (id) on delete restrict,
  display_order bigint not null default nextval('public.display_order_seq'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index brands_name_normalized_key
  on public.brands ((lower(private.normalize_label(name))));
create index brands_display_order_idx on public.brands (display_order, id);
create trigger brands_set_updated_at
before update on public.brands
for each row execute function public.set_updated_at();

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (pg_catalog.btrim(name) <> ''),
  parent_id uuid references public.categories (id) on delete restrict,
  image_media_asset_id uuid references public.media_assets (id) on delete restrict,
  display_order bigint not null default nextval('public.display_order_seq'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_not_self_parent check (parent_id is null or parent_id <> id)
);
create unique index categories_root_name_normalized_key
  on public.categories ((lower(private.normalize_label(name))))
  where parent_id is null;
create unique index categories_child_name_normalized_key
  on public.categories (parent_id, (lower(private.normalize_label(name))))
  where parent_id is not null;
create index categories_parent_order_idx
  on public.categories (parent_id, display_order, id);

create function public.enforce_category_hierarchy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_parent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'a category cannot be its own parent'
      using errcode = 'check_violation';
  end if;

  select c.parent_id into parent_parent_id
  from public.categories c
  where c.id = new.parent_id;

  if not found then
    raise exception 'parent category does not exist'
      using errcode = 'foreign_key_violation';
  end if;

  if parent_parent_id is not null then
    raise exception 'category hierarchy is limited to two levels'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.categories child
    where child.parent_id = new.id
  ) then
    raise exception 'a category with children cannot become a child category'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger categories_enforce_hierarchy
before insert or update of parent_id on public.categories
for each row execute function public.enforce_category_hierarchy();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create table public.option_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (pg_catalog.btrim(name) <> ''),
  display_order bigint not null default nextval('public.display_order_seq'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index option_types_name_normalized_key
  on public.option_types ((lower(private.normalize_label(name))));
create index option_types_order_idx
  on public.option_types (display_order, id);
create trigger option_types_set_updated_at
before update on public.option_types
for each row execute function public.set_updated_at();

create table public.option_values (
  id uuid primary key default gen_random_uuid(),
  option_type_id uuid not null references public.option_types (id) on delete restrict,
  value text not null check (pg_catalog.btrim(value) <> ''),
  display_order bigint not null default nextval('public.display_order_seq'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint option_values_type_identity unique (id, option_type_id)
);
create unique index option_values_type_value_normalized_key
  on public.option_values (option_type_id, private.normalize_option_value(value));
create index option_values_type_order_idx
  on public.option_values (option_type_id, display_order, id);
create trigger option_values_set_updated_at
before update on public.option_values
for each row execute function public.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (pg_catalog.btrim(name) <> ''),
  brand_id uuid references public.brands (id) on delete restrict,
  cover_media_asset_id uuid references public.media_assets (id) on delete restrict,
  short_description text
    check (short_description is null or pg_catalog.btrim(short_description) <> ''),
  search_keywords text[],
  display_order bigint not null default nextval('public.display_order_seq'),
  is_featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_brand_id_idx on public.products (brand_id);
create index products_order_idx on public.products (display_order, id);
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- Deliberately simple taxonomy: no Primary Category and no category-specific
-- Product rank. The kiosk snapshot is filtered/sorted locally by Flutter.
create table public.product_categories (
  product_id uuid not null references public.products (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, category_id)
);
create index product_categories_category_idx
  on public.product_categories (category_id, product_id);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  sku text not null default
    ('KSK-' || lpad(nextval('public.product_variant_sku_seq')::text, 6, '0')),
  barcode text check (barcode is null or pg_catalog.btrim(barcode) <> ''),
  title_override text
    check (title_override is null or pg_catalog.btrim(title_override) <> ''),
  search_keywords text[],
  display_order bigint not null default nextval('public.display_order_seq'),
  is_active boolean not null default true,
  low_stock_threshold integer
    check (low_stock_threshold is null or low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_variants_sku_normalized_key
  on public.product_variants (upper(sku));
create unique index product_variants_barcode_key
  on public.product_variants (upper(barcode)) where barcode is not null;
create index product_variants_product_order_idx
  on public.product_variants (product_id, display_order, id);
create trigger product_variants_set_updated_at
before update on public.product_variants
for each row execute function public.set_updated_at();

create table public.variant_option_values (
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  option_type_id uuid not null references public.option_types (id) on delete restrict,
  option_value_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (variant_id, option_type_id),
  constraint variant_option_values_value_type_fkey
    foreign key (option_value_id, option_type_id)
    references public.option_values (id, option_type_id)
    on delete restrict
);
create index variant_option_values_value_idx
  on public.variant_option_values (option_value_id, variant_id);

create table public.product_variant_media (
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  media_asset_id uuid not null references public.media_assets (id) on delete restrict,
  display_order bigint not null default nextval('public.display_order_seq'),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (variant_id, media_asset_id)
);
create unique index product_variant_media_one_primary_per_variant
  on public.product_variant_media (variant_id) where is_primary;
create index product_variant_media_order_idx
  on public.product_variant_media (variant_id, display_order, media_asset_id);
create index product_variant_media_asset_idx
  on public.product_variant_media (media_asset_id);

revoke all on function public.enforce_category_hierarchy()
from public, anon, authenticated;
