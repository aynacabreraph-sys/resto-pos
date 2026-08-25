-- Manual cash confirmation, electronic payment evidence, activation-based pager cycling,
-- completed queue history, and fixed direct labor COGS.
-- Safe to run repeatedly and preserves historical payment and queue records.

alter table public.products
  add column if not exists "directLaborCost" numeric(12,2) not null default 0;

alter table public.transactions
  add column if not exists "paymentEvidencePhoto" text,
  add column if not exists "paymentEvidenceRequired" boolean not null default false;

alter table public.products drop constraint if exists products_direct_labor_cost_nonnegative;
alter table public.products add constraint products_direct_labor_cost_nonnegative
  check ("directLaborCost" >= 0);

alter table public.transactions drop constraint if exists transactions_payment_evidence_required;
alter table public.transactions add constraint transactions_payment_evidence_required check (
  not "paymentEvidenceRequired"
  or ("paymentMethod" in ('GCash', 'Bank Transfer') and nullif("paymentEvidencePhoto", '') is not null)
);

create index if not exists idx_order_queue_completed_at
  on public.order_queue ("completedAt" desc) where status = 'completed';

create or replace function public.reserve_next_pager(p_checkout_key text, p_staff_id bigint default null, p_staff_name text default null)
returns table(queue_id bigint, pager_number integer)
language plpgsql
as $$
declare
  last_number integer;
  candidate integer;
  i integer;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  update public.order_queue set status = 'cancelled'
  where status = 'reserved' and "reservedAt" < now_ms - 300000;

  select id, "pagerNumber" into queue_id, pager_number
  from public.order_queue where "checkoutKey" = p_checkout_key and status in ('reserved','active');
  if queue_id is not null then return next; return; end if;

  select "lastAssigned" into last_number from public.pager_state where id = 1 for update;
  for i in 1..10 loop
    candidate := ((last_number + i - 1) % 10) + 1;
    if not exists (select 1 from public.order_queue where "pagerNumber" = candidate and status in ('reserved','active')) then
      insert into public.order_queue ("checkoutKey", "pagerNumber", status, "staffId", "staffName", "reservedAt")
      values (p_checkout_key, candidate, 'reserved', p_staff_id, p_staff_name, now_ms)
      returning id into queue_id;
      pager_number := candidate;
      return next; return;
    end if;
  end loop;
  raise exception 'All pagers are currently in use.' using errcode = 'P0001';
end;
$$;

create or replace function public.activate_reserved_queue(
  p_checkout_key text,
  p_transaction_id bigint,
  p_receipt_no text,
  p_order_type text,
  p_staff_id bigint,
  p_staff_name text,
  p_items jsonb
)
returns table(queue_id bigint, pager_number integer, queued_at bigint)
language plpgsql
as $$
declare
  queue_row public.order_queue%rowtype;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  select * into queue_row from public.order_queue where "checkoutKey" = p_checkout_key for update;
  if queue_row.id is null then raise exception 'Pager reservation was not found.' using errcode = 'P0001'; end if;

  if queue_row.status in ('active','completed') then
    queue_id := queue_row.id; pager_number := queue_row."pagerNumber"; queued_at := queue_row."queuedAt";
    return next; return;
  end if;
  if queue_row.status <> 'reserved' then
    raise exception 'Pager reservation is no longer active.' using errcode = 'P0001';
  end if;

  perform 1 from public.pager_state where id = 1 for update;
  update public.order_queue set
    "transactionId" = p_transaction_id, "receiptNo" = p_receipt_no, status = 'active',
    "orderType" = p_order_type, "staffId" = p_staff_id, "staffName" = p_staff_name, "queuedAt" = now_ms
  where id = queue_row.id;

  insert into public.order_queue_items ("queueId", "transactionItemIndex", "unitIndex", "productId", name, modifiers, served)
  select queue_row.id, item_ordinality::integer - 1, unit_ordinality - 1,
    nullif(item ->> 'productId', '')::bigint, coalesce(nullif(item ->> 'name', ''), 'Item'),
    coalesce(item -> 'modifiers', '[]'::jsonb), false
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as expanded(item, item_ordinality)
  cross join lateral generate_series(1, greatest(1, coalesce(nullif(item ->> 'quantity', '')::integer, 1))) as generated(unit_ordinality)
  on conflict ("queueId", "transactionItemIndex", "unitIndex") do nothing;

  update public.pager_state set "lastAssigned" = queue_row."pagerNumber", "updatedAt" = now_ms where id = 1;
  queue_id := queue_row.id; pager_number := queue_row."pagerNumber"; queued_at := now_ms;
  return next;
end;
$$;

grant execute on function public.activate_reserved_queue(text,bigint,text,text,bigint,text,jsonb) to anon, authenticated;
