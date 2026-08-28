-- KIOSK Database V2 Lean · 04 stock ledger + immutable orders.

create table public.inventory (
  variant_id uuid primary key references public.product_variants (id) on delete cascade,
  current_quantity integer not null default 0 check (current_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger inventory_set_updated_at
before update on public.inventory
for each row execute function public.set_updated_at();

create table public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  quantity_change integer not null check (quantity_change <> 0),
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  adjustment_type public.inventory_adjustment_type not null,
  reason text check (reason is null or pg_catalog.btrim(reason) <> ''),
  created_by uuid not null references public.profiles (id) on delete restrict,
  order_id uuid,
  created_at timestamptz not null default now(),
  constraint inventory_adjustments_quantity_coherent
    check (quantity_after = quantity_before + quantity_change),
  constraint inventory_adjustments_reason_required check (
    adjustment_type not in ('manual_increase', 'manual_decrease', 'damaged_or_expired')
    or reason is not null
  ),
  constraint inventory_adjustments_order_link_coherent check (
    (adjustment_type in ('order_deduction', 'order_cancellation_restoration') and order_id is not null)
    or
    (adjustment_type not in ('order_deduction', 'order_cancellation_restoration') and order_id is null)
  ),
  constraint inventory_adjustments_direction check (
    (adjustment_type in ('initial_stock','stock_received','manual_increase','order_cancellation_restoration')
      and quantity_change > 0)
    or
    (adjustment_type in ('manual_decrease','damaged_or_expired','order_deduction')
      and quantity_change < 0)
  )
);
create index inventory_adjustments_variant_idx
  on public.inventory_adjustments (variant_id, created_at desc);
create index inventory_adjustments_order_idx
  on public.inventory_adjustments (order_id) where order_id is not null;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  display_number text not null unique
    check (display_number ~ '^[A-HJ-NP-Z2-9]{6}$'),
  client_request_id uuid not null unique,
  request_fingerprint text not null check (pg_catalog.btrim(request_fingerprint) <> ''),
  status public.order_status not null default 'new',
  created_by uuid not null references public.profiles (id) on delete restrict,
  assigned_preparation_id uuid references public.profiles (id) on delete restrict,
  completed_by uuid references public.profiles (id) on delete restrict,
  completed_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_reason text
    check (cancellation_reason is null or pg_catalog.btrim(cancellation_reason) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_assignment_coherent check (
    (status = 'new' and assigned_preparation_id is null)
    or status in ('preparing','ready','completed','cancelled')
  ),
  constraint orders_active_assignment_required check (
    status not in ('preparing','ready','completed') or assigned_preparation_id is not null
  ),
  constraint orders_completed_state_coherent check (
    (status = 'completed' and completed_by is not null and completed_at is not null)
    or
    (status <> 'completed' and completed_by is null and completed_at is null)
  ),
  constraint orders_cancelled_state_coherent check (
    (status = 'cancelled' and cancelled_by is not null and cancelled_at is not null)
    or
    (status <> 'cancelled' and cancelled_by is null and cancelled_at is null
      and cancellation_reason is null)
  )
);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_created_by_idx on public.orders (created_by);
create index orders_assigned_preparation_idx
  on public.orders (assigned_preparation_id) where assigned_preparation_id is not null;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

alter table public.inventory_adjustments
  add constraint inventory_adjustments_order_fkey
  foreign key (order_id) references public.orders (id) on delete restrict;

create unique index inventory_adjustments_restoration_order_variant_key
  on public.inventory_adjustments (order_id, variant_id)
  where adjustment_type = 'order_cancellation_restoration';

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  variant_id uuid not null references public.product_variants (id) on delete restrict,
  product_name text not null check (pg_catalog.btrim(product_name) <> ''),
  variant_name text
    check (variant_name is null or pg_catalog.btrim(variant_name) <> ''),
  variant_sku text not null check (pg_catalog.btrim(variant_sku) <> ''),
  variant_options jsonb not null default '[]'::jsonb,
  brand_name text check (brand_name is null or pg_catalog.btrim(brand_name) <> ''),
  image_public_id text,
  image_secure_url text
    check (image_secure_url is null or image_secure_url ~ '^https://'),
  quantity integer not null check (quantity > 0),
  unique (order_id, variant_id)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_variant_idx on public.order_items (variant_id);
create index order_items_image_public_id_idx
  on public.order_items (image_public_id) where image_public_id is not null;

create function public.create_inventory_for_variant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory (variant_id, current_quantity)
  values (new.id, 0);
  return new;
end;
$$;

create trigger product_variants_create_inventory
after insert on public.product_variants
for each row execute function public.create_inventory_for_variant();

create function public.prevent_order_item_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'order items are immutable' using errcode = 'check_violation';
end;
$$;

create trigger order_items_are_immutable
before update or delete on public.order_items
for each row execute function public.prevent_order_item_mutation();

revoke all on function public.create_inventory_for_variant(),
  public.prevent_order_item_mutation()
from public, anon, authenticated;
