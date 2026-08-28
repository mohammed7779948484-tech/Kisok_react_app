-- KIOSK Database V2 Lean · 02 profiles, media registry, singleton settings.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  display_name text not null check (pg_catalog.btrim(display_name) <> ''),
  role public.app_role not null,
  is_active boolean not null default true,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_unique
  on public.profiles (lower(email)) where email is not null;
create index profiles_email_trgm_idx
  on public.profiles using gin (lower(email) extensions.gin_trgm_ops)
  where email is not null;
create index profiles_display_name_trgm_idx
  on public.profiles using gin (lower(display_name) extensions.gin_trgm_ops);

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create function public.populate_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    select lower(u.email) into new.email from auth.users u where u.id = new.id;
  else
    new.email := lower(new.email);
  end if;
  return new;
end;
$$;

create trigger profiles_populate_email
before insert or update of id, email on public.profiles
for each row execute function public.populate_profile_email();

create function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = lower(new.email)
  where id = new.id and email is distinct from lower(new.email);
  return new;
end;
$$;

create trigger auth_user_sync_profile_email
after insert or update of email on auth.users
for each row execute function public.sync_profile_email_from_auth();

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique
    check (pg_catalog.length(pg_catalog.btrim(public_id)) between 1 and 255),
  secure_url text not null check (secure_url ~ '^https://'),
  asset_id text unique,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  format text,
  bytes bigint check (bytes is null or bytes >= 0),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index media_assets_created_by_idx
  on public.media_assets (created_by) where created_by is not null;

create function public.protect_media_asset_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.public_id is distinct from old.public_id
     or new.asset_id is distinct from old.asset_id then
    raise exception 'media identity fields are immutable'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger media_assets_protect_identity
before update on public.media_assets
for each row execute function public.protect_media_asset_identity();

create trigger media_assets_set_updated_at
before update on public.media_assets
for each row execute function public.set_updated_at();

create table public.store_settings (
  id boolean primary key default true,
  store_name text not null check (pg_catalog.btrim(store_name) <> ''),
  logo_media_asset_id uuid references public.media_assets (id) on delete restrict,
  global_low_stock_threshold integer not null default 5
    check (global_low_stock_threshold >= 0),
  customer_success_reset_seconds integer not null default 25
    check (customer_success_reset_seconds > 0),
  store_timezone text not null check (pg_catalog.btrim(store_timezone) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_settings_singleton_key check (id)
);

create trigger store_settings_set_updated_at
before update on public.store_settings
for each row execute function public.set_updated_at();

revoke all on function public.set_updated_at(),
  public.populate_profile_email(),
  public.sync_profile_email_from_auth(),
  public.protect_media_asset_identity()
from public, anon, authenticated;
