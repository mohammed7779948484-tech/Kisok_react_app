-- KIOSK Database V2 Lean · 05 startup identity + privileged Admin-user helpers.

create function public.current_active_profile()
returns table (
  id uuid,
  display_name text,
  role public.app_role,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.role, p.is_active
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
$$;

-- Service-role only. The Admin Users Edge Function authenticates the browser,
-- then calls this function using the verified actor id.
create function public.admin_update_profile(
  actor_id uuid,
  target_id uuid,
  changes jsonb
)
returns table (
  id uuid,
  display_name text,
  role public.app_role,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor public.profiles%rowtype;
  target public.profiles%rowtype;
  requested_name text;
  requested_role public.app_role;
  requested_active boolean;
  active_admin_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('kiosk_active_admin_invariant')
  );

  select * into actor
  from public.profiles p where p.id = actor_id for update;

  if not found or actor.role <> 'admin' or not actor.is_active then
    raise exception 'an active Admin actor is required'
      using errcode = 'insufficient_privilege';
  end if;

  select * into target
  from public.profiles p where p.id = target_id for update;

  if not found then
    raise exception 'profile does not exist'
      using errcode = 'foreign_key_violation';
  end if;

  if changes is null or pg_catalog.jsonb_typeof(changes) <> 'object' then
    raise exception 'changes must be a JSON object'
      using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1 from pg_catalog.jsonb_object_keys(changes) key
    where key not in ('display_name','role','is_active')
  ) then
    raise exception 'changes contains an unsupported field'
      using errcode = 'invalid_parameter_value';
  end if;

  requested_name := case
    when changes ? 'display_name'
      then private.normalize_label(changes ->> 'display_name')
    else target.display_name
  end;

  begin
    requested_role := case
      when changes ? 'role' then (changes ->> 'role')::public.app_role
      else target.role
    end;
    requested_active := case
      when changes ? 'is_active' then (changes ->> 'is_active')::boolean
      else target.is_active
    end;
  exception
    when invalid_text_representation then
      raise exception 'invalid profile changes'
        using errcode = 'invalid_parameter_value';
  end;

  if requested_name is null or requested_name = '' then
    raise exception 'display_name is required'
      using errcode = 'invalid_parameter_value';
  end if;

  if actor_id = target_id and (requested_role <> 'admin' or not requested_active) then
    raise exception 'you cannot remove your own administrator access'
      using errcode = 'check_violation';
  end if;

  if target.role = 'admin' and target.is_active
     and (requested_role <> 'admin' or not requested_active) then
    select pg_catalog.count(*) into active_admin_count
    from public.profiles p
    where p.role = 'admin' and p.is_active;

    if active_admin_count <= 1 then
      raise exception 'the last active administrator cannot be changed'
        using errcode = 'check_violation';
    end if;
  end if;

  return query
  update public.profiles p
  set display_name = requested_name,
      role = requested_role,
      is_active = requested_active
  where p.id = target_id
  returning p.id, p.display_name, p.role, p.is_active, p.updated_at;
end;
$$;

create function public.search_admin_profiles(
  search_term text,
  page_size integer default 50,
  page_offset integer default 0
)
returns table (
  id uuid,
  email text,
  display_name text,
  role public.app_role,
  is_active boolean,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    coalesce(p.email, ''),
    p.display_name,
    p.role,
    p.is_active,
    p.created_at,
    pg_catalog.count(*) over()
  from public.profiles p
  where nullif(pg_catalog.btrim(search_term), '') is null
     or lower(coalesce(p.email, '')) like '%' || lower(pg_catalog.btrim(search_term)) || '%'
     or lower(p.display_name) like '%' || lower(pg_catalog.btrim(search_term)) || '%'
     or p.role::text = lower(pg_catalog.btrim(search_term))
  order by p.created_at desc, p.id desc
  limit least(greatest(page_size, 1), 200)
  offset greatest(page_offset, 0)
$$;

revoke all on function public.current_active_profile(),
  public.admin_update_profile(uuid, uuid, jsonb),
  public.search_admin_profiles(text, integer, integer)
from public, anon, authenticated;


