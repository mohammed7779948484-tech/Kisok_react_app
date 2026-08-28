-- KIOSK Database V2 Lean · 08 one controlled order-state RPC.
-- Preparation UI needs only: new→preparing, preparing→ready, cancel.
-- Admin completes ready orders and may cancel non-final orders.

create function public.update_order_status(
  order_id uuid,
  target_status public.order_status,
  reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  actor_role public.app_role;
  saved_order public.orders%rowtype;
  normalized_reason text;
  line public.order_items%rowtype;
  quantity_before integer;
  quantity_after integer;
begin
  select p.id, p.role into actor_id, actor_role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
    and p.role in ('admin','preparation');

  if actor_id is null then
    raise exception using
      errcode = '42501',
      message = 'An active Admin or Preparation profile is required.';
  end if;

  if update_order_status.order_id is null
     or update_order_status.target_status is null then
    raise exception using
      errcode = 'K1001',
      message = 'The order action is invalid.';
  end if;

  select o.* into saved_order
  from public.orders o
  where o.id = update_order_status.order_id
  for update;

  if not found then
    raise exception using
      errcode = 'K1002',
      message = 'The order does not exist.';
  end if;

  if saved_order.status in ('completed','cancelled') then
    raise exception using
      errcode = 'K1004',
      message = 'The order is already final.';
  end if;

  normalized_reason := nullif(pg_catalog.btrim(update_order_status.reason), '');

  if update_order_status.target_status = 'cancelled' then
    if actor_role = 'preparation'
       and saved_order.status not in ('new','preparing') then
      raise exception using
        errcode = 'K1004',
        message = 'Preparation cannot cancel the order in its current state.';
    end if;

    -- Restore each line exactly once. The order row lock serializes cancellation;
    -- the partial unique ledger index is the final duplicate-restoration guard.
    for line in
      select oi.* from public.order_items oi
      where oi.order_id = saved_order.id
      order by oi.variant_id
    loop
      if not exists (
        select 1
        from public.inventory_adjustments ia
        where ia.order_id = saved_order.id
          and ia.variant_id = line.variant_id
          and ia.adjustment_type = 'order_cancellation_restoration'
      ) then
        select i.current_quantity into quantity_before
        from public.inventory i
        where i.variant_id = line.variant_id
        for update;

        if not found then
          raise exception using
            errcode = 'K1006',
            message = 'Order inventory could not be restored.';
        end if;

        if quantity_before::bigint + line.quantity::bigint > 2147483647 then
          raise exception using
            errcode = 'K1006',
            message = 'Order inventory could not be restored.';
        end if;

        quantity_after := quantity_before + line.quantity;

        update public.inventory i
        set current_quantity = quantity_after
        where i.variant_id = line.variant_id;

        insert into public.inventory_adjustments (
          variant_id,
          quantity_change,
          quantity_before,
          quantity_after,
          adjustment_type,
          reason,
          created_by,
          order_id
        )
        values (
          line.variant_id,
          line.quantity,
          quantity_before,
          quantity_after,
          'order_cancellation_restoration',
          null,
          actor_id,
          saved_order.id
        );
      end if;
    end loop;

    update public.orders o
    set status = 'cancelled',
        cancelled_by = actor_id,
        cancelled_at = now(),
        cancellation_reason = normalized_reason
    where o.id = saved_order.id
    returning * into saved_order;

  elsif actor_role = 'preparation'
        and saved_order.status = 'new'
        and update_order_status.target_status = 'preparing' then

    if saved_order.assigned_preparation_id is not null then
      raise exception using
        errcode = 'K1004',
        message = 'The order is already assigned.';
    end if;

    update public.orders o
    set status = 'preparing',
        assigned_preparation_id = actor_id
    where o.id = saved_order.id
    returning * into saved_order;

  elsif actor_role = 'preparation'
        and saved_order.status = 'preparing'
        and update_order_status.target_status = 'ready' then

    if saved_order.assigned_preparation_id is distinct from actor_id then
      raise exception using
        errcode = '42501',
        message = 'Only the assigned Preparation employee can mark this order ready.';
    end if;

    update public.orders o
    set status = 'ready'
    where o.id = saved_order.id
    returning * into saved_order;

  elsif actor_role = 'admin'
        and saved_order.status = 'ready'
        and update_order_status.target_status = 'completed' then

    update public.orders o
    set status = 'completed',
        completed_by = actor_id,
        completed_at = now()
    where o.id = saved_order.id
    returning * into saved_order;

  else
    raise exception using
      errcode = 'K1004',
      message = 'The requested order transition is not allowed.';
  end if;

  return pg_catalog.jsonb_build_object(
    'order_id', saved_order.id,
    'display_number', saved_order.display_number,
    'status', saved_order.status,
    'assigned_preparation_id', saved_order.assigned_preparation_id,
    'completed_at', saved_order.completed_at,
    'cancelled_at', saved_order.cancelled_at,
    'cancellation_reason', saved_order.cancellation_reason,
    'updated_at', saved_order.updated_at
  );
end;
$$;

revoke all on function public.update_order_status(uuid, public.order_status, text)
from public, anon, authenticated;
