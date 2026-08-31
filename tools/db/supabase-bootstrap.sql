-- Minimal Supabase platform surface required by the KISOK migrations.
--
-- A Supabase project ships roles, an `auth` schema, and a Realtime publication
-- before any project migration runs. `supabase/migrations/*.sql` depends on all
-- three, so an ephemeral Postgres needs them created first.
--
-- This is ONLY for generating types and validating migrations offline. It is not
-- a reimplementation of Supabase Auth and must never be applied to a real
-- project.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role supabase_admin login superuser createdb createrole replication bypassrls;

create schema if not exists extensions;
create schema if not exists auth;

-- The subset of `auth.users` the migrations reference: the profiles foreign key
-- and the email-sync trigger.
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

-- `auth.uid()` is read by every RLS policy and security-definer function.
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')::text
$$;

-- Realtime publication that migration 12 adds `public.orders` to.
create publication supabase_realtime;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
