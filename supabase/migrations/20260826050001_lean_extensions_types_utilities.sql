-- KIOSK Database V2 Lean · 01 extensions, enums, shared normalizers/sequences.
-- Target: one in-store customer kiosk, Admin web, Preparation workflow.
-- Keep structural invariants strong; avoid server-side catalog orchestration.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('admin', 'preparation', 'customer');

create type public.order_status as enum (
  'new', 'preparing', 'ready', 'completed', 'cancelled'
);

create type public.inventory_adjustment_type as enum (
  'initial_stock',
  'stock_received',
  'manual_increase',
  'manual_decrease',
  'damaged_or_expired',
  'order_deduction',
  'order_cancellation_restoration'
);

create schema private;

-- One global monotonic ordering source. Ordered scopes compare values only
-- inside their scope; global uniqueness removes rank ties without allocators.
create sequence public.display_order_seq
  as bigint start with 10 increment by 10 no minvalue no maxvalue cache 1;

create sequence public.product_variant_sku_seq
  as bigint start with 1 increment by 1 no minvalue no maxvalue cache 1;

create function private.normalize_label(raw text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select pg_catalog.regexp_replace(pg_catalog.btrim(raw), '[[:space:]]+', ' ', 'g')
$$;

create function private.normalize_option_value(raw text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select lower(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(pg_catalog.btrim(raw), '[[:space:]]+', ' ', 'g'),
      ' ',
      '',
      'g'
    )
  )
$$;

revoke all on schema private from public, anon, authenticated;
revoke all on function private.normalize_label(text),
  private.normalize_option_value(text)
from public, anon, authenticated, service_role;

revoke all on sequence public.display_order_seq,
  public.product_variant_sku_seq
from public, anon, authenticated, service_role;

revoke all on type public.app_role,
  public.order_status,
  public.inventory_adjustment_type
from public, anon, authenticated;

grant usage on type public.app_role,
  public.order_status,
  public.inventory_adjustment_type
to authenticated, service_role;
