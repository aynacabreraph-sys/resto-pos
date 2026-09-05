-- Security, atomic sale/void processing, exact stock snapshots, and operational hardening.
-- Apply after 20260825_payment_queue_labor_upgrade.sql.

create extension if not exists pgcrypto;

create table if not exists public.app_sessions (
  "userId" uuid primary key references auth.users(id) on delete cascade,
  "staffId" bigint not null references public.staff(id) on delete cascade,
  "expiresAt" timestamptz not null default (now() + interval '12 hours'),
  "createdAt" timestamptz not null default now()
);
alter table public.app_sessions enable row level security;
create table if not exists public.pin_attempts (
  "userId" uuid primary key references auth.users(id) on delete cascade,
  attempts integer not null default 0,
  "windowStartedAt" timestamptz not null default now(),
  "lockedUntil" timestamptz
);
alter table public.pin_attempts enable row level security;

create or replace function public.is_pos_session_active()
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.app_sessions where "userId"=auth.uid() and "expiresAt">now())
$$;
create or replace function public.current_pos_role()
returns text language sql security definer set search_path = public stable as $$
  select s.role from public.app_sessions a join public.staff s on s.id=a."staffId"
  where a."userId"=auth.uid() and a."expiresAt">now()
$$;

alter table public.staff add column if not exists "pinHash" text;
update public.staff
set "pinHash" = crypt(lpad(pin, 6, '0'), gen_salt('bf', 11)), pin = null
where nullif(pin, '') is not null and "pinHash" is null;

create or replace function public.hash_staff_pin_on_write()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.pin is not null then
    if new.pin !~ '^[0-9]{6}$' then raise exception 'PIN must be exactly six digits.'; end if;
    new."pinHash" := crypt(new.pin, gen_salt('bf', 11));
    new.pin := null;
  end if;
  return new;
end $$;
drop trigger if exists staff_hash_pin on public.staff;
create trigger staff_hash_pin before insert or update of pin on public.staff
for each row execute function public.hash_staff_pin_on_write();

create or replace function public.authenticate_staff(p_pin text)
returns table(id bigint, name text, role text, "hourlyRate" numeric, "profileImage" text)
language plpgsql security definer set search_path = public, extensions as $$
declare matched public.staff%rowtype;
begin
  if auth.uid() is null then raise exception 'An authenticated device session is required.'; end if;
  if exists(select 1 from public.pin_attempts where "userId"=auth.uid() and "lockedUntil">now()) then
    raise exception 'Too many attempts. Wait five minutes and try again.';
  end if;
  select * into matched from public.staff s where p_pin ~ '^[0-9]{6}$' and s."pinHash"=crypt(p_pin,s."pinHash") limit 1;
  if matched.id is null then
    insert into public.pin_attempts("userId",attempts,"windowStartedAt","lockedUntil") values(auth.uid(),1,now(),null)
    on conflict("userId") do update set
      attempts=case when public.pin_attempts."windowStartedAt" < now()-interval '5 minutes' then 1 else public.pin_attempts.attempts+1 end,
      "windowStartedAt"=case when public.pin_attempts."windowStartedAt" < now()-interval '5 minutes' then now() else public.pin_attempts."windowStartedAt" end,
      "lockedUntil"=case when (case when public.pin_attempts."windowStartedAt" < now()-interval '5 minutes' then 1 else public.pin_attempts.attempts+1 end)>=8 then now()+interval '5 minutes' else null end;
    return;
  end if;
  delete from public.pin_attempts where "userId"=auth.uid();
  insert into public.app_sessions("userId","staffId","expiresAt") values(auth.uid(),matched.id,now()+interval '12 hours')
  on conflict("userId") do update set "staffId"=excluded."staffId","expiresAt"=excluded."expiresAt","createdAt"=now();
  id:=matched.id; name:=matched.name; role:=matched.role; "hourlyRate":=matched."hourlyRate"; "profileImage":=matched."profileImage";
  return next;
end
$$;

create or replace function public.end_pos_session()
returns void language sql security definer set search_path = public as $$
  delete from public.app_sessions where "userId"=auth.uid()
$$;
create or replace function public.staff_count()
returns bigint language sql security definer set search_path = public stable as $$ select count(*) from public.staff $$;

create or replace function public.verify_staff_pin(p_staff_id bigint, p_pin text)
returns boolean language sql security definer set search_path = public, extensions stable as $$
  select exists (
    select 1 from public.staff s
    where s.id = p_staff_id and p_pin ~ '^[0-9]{6}$'
      and s."pinHash" = crypt(p_pin, s."pinHash")
  )
$$;

create or replace function public.save_staff_record(
  p_id bigint, p_name text, p_role text, p_hourly_rate numeric,
  p_profile_image text, p_pin text default null
) returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare result_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('staff-pin-write'));
  if exists(select 1 from public.staff) and coalesce(public.current_pos_role(),'') <> 'owner' then raise exception 'Owner authorization is required.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Name is required.'; end if;
  if p_role not in ('owner','manager','cashier','staff') then raise exception 'Invalid role.'; end if;
  if coalesce(p_hourly_rate, 0) < 0 then raise exception 'Hourly rate cannot be negative.'; end if;
  if p_pin is not null and p_pin !~ '^[0-9]{6}$' then raise exception 'PIN must be exactly six digits.'; end if;
  if p_pin is not null and exists (
    select 1 from public.staff s where s.id is distinct from p_id
      and s."pinHash" = crypt(p_pin, s."pinHash")
  ) then raise exception 'This PIN is already in use.'; end if;

  if p_id is null then
    if p_pin is null then raise exception 'A PIN is required for new staff.'; end if;
    insert into public.staff(name, pin, role, "hourlyRate", "profileImage")
    values (trim(p_name), p_pin, p_role, coalesce(p_hourly_rate, 0), p_profile_image)
    returning id into result_id;
  else
    update public.staff set name = trim(p_name), role = p_role,
      "hourlyRate" = coalesce(p_hourly_rate, 0), "profileImage" = p_profile_image,
      pin = case when p_pin is null then pin else p_pin end
    where id = p_id returning id into result_id;
    if result_id is null then raise exception 'Staff member not found.'; end if;
  end if;
  return result_id;
end $$;

create or replace function public.finalize_pos_checkout(
  p_transaction jsonb, p_authorizations jsonb, p_checkout_key text
) returns table(transaction_id bigint, queue_id bigint, pager_number integer, queued_at bigint)
language plpgsql security definer set search_path = public as $$
declare
  tx public.transactions%rowtype;
  existing_tx public.transactions%rowtype;
  queue_row public.order_queue%rowtype;
  item jsonb; component jsonb; unit_no integer; item_index integer;
  before_qty numeric; after_qty numeric;
  tx_cost numeric := 0; tx_count integer := 0; now_ms bigint; computed_subtotal numeric; computed_discount numeric;
begin
  if not public.is_pos_session_active() then raise exception 'Your POS session has expired. Sign in again.'; end if;
  if not exists(select 1 from public.app_sessions where "userId"=auth.uid() and "staffId"=nullif(p_transaction->>'staffId','')::bigint and "expiresAt">now()) then raise exception 'Checkout staff does not match the current session.'; end if;
  now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  select * into queue_row from public.order_queue
    where "checkoutKey" = p_checkout_key for update;
  select * into existing_tx from public.transactions where "checkoutKey" = p_checkout_key limit 1;
  if existing_tx.id is not null and queue_row.status in ('active','completed') and queue_row."transactionId" = existing_tx.id then
    transaction_id := existing_tx.id; queue_id := queue_row.id; pager_number := queue_row."pagerNumber"; queued_at := queue_row."queuedAt";
    return next; return;
  end if;
  if queue_row.id is null or queue_row.status <> 'reserved' then
    raise exception 'Pager reservation is no longer active.';
  end if;
  if coalesce(p_transaction->>'checkoutKey','') <> p_checkout_key then
    raise exception 'Checkout key mismatch.';
  end if;
  if p_transaction->>'paymentMethod' not in ('Cash','GCash','Bank Transfer','Foodpanda') then raise exception 'Unsupported payment method.'; end if;
  select coalesce(sum((value->>'configuredPrice')::numeric * greatest(1,coalesce((value->>'quantity')::integer,1))),0)
    into computed_subtotal from jsonb_array_elements(coalesce(p_transaction->'items','[]'::jsonb));
  select coalesce(sum((value->>'discountAmount')::numeric),0) into computed_discount
    from jsonb_array_elements(coalesce(p_authorizations,'[]'::jsonb));
  if round(computed_subtotal,2) <> round((p_transaction->>'subtotal')::numeric,2)
     or round(computed_discount,2) <> round(coalesce((p_transaction->>'discountTotal')::numeric,0),2)
     or round(greatest(0,computed_subtotal-computed_discount),2) <> round((p_transaction->>'total')::numeric,2) then
    raise exception 'Checkout totals failed validation.';
  end if;
  if jsonb_array_length(coalesce(p_authorizations,'[]'::jsonb)) <> coalesce((p_transaction->>'discountAuthorizationCount')::integer,0) then raise exception 'Discount authorization count mismatch.'; end if;
  if p_transaction->>'paymentMethod'='Cash' and coalesce(nullif(p_transaction->>'cashReceived','')::numeric,-1) < (p_transaction->>'total')::numeric then raise exception 'Cash received is insufficient.'; end if;
  if p_transaction->>'paymentMethod' in ('GCash','Bank Transfer') and nullif(p_transaction->>'paymentEvidencePhoto','') is null then raise exception 'Electronic payment evidence is required.'; end if;
  if length(coalesce(p_transaction->>'paymentEvidencePhoto','')) > 3000000
     or exists(select 1 from jsonb_array_elements(coalesce(p_authorizations,'[]'::jsonb)) a where length(coalesce(a->>'photo',''))>3000000) then raise exception 'Captured photo is too large.'; end if;
  if coalesce((p_transaction->>'paymentEvidenceRequired')::boolean, false)
     and (p_transaction->>'paymentMethod' not in ('GCash','Bank Transfer')
       or nullif(p_transaction->>'paymentEvidencePhoto','') is null) then
    raise exception 'Payment evidence is required.';
  end if;

  insert into public.transactions("receiptNo","checkoutKey",datetime,"orderType",items,"paymentMethod","paymentLines",subtotal,
    "discountTotal","discountAuthorizationCount",total,"cashReceived","paymentEvidencePhoto","paymentEvidenceRequired","staffId","staffName",status)
  values (p_transaction->>'receiptNo',p_checkout_key,(p_transaction->>'datetime')::bigint,p_transaction->>'orderType',
    coalesce(p_transaction->'items','[]'::jsonb),p_transaction->>'paymentMethod',coalesce(p_transaction->'paymentLines','[]'::jsonb),
    (p_transaction->>'subtotal')::numeric,coalesce((p_transaction->>'discountTotal')::numeric,0),
    coalesce((p_transaction->>'discountAuthorizationCount')::integer,0),(p_transaction->>'total')::numeric,
    nullif(p_transaction->>'cashReceived','')::numeric,p_transaction->>'paymentEvidencePhoto',
    coalesce((p_transaction->>'paymentEvidenceRequired')::boolean,false),nullif(p_transaction->>'staffId','')::bigint,
    p_transaction->>'staffName',coalesce(p_transaction->>'status','completed'))
  returning * into tx;

  for item in select * from jsonb_array_elements(coalesce(tx.items, '[]'::jsonb)) loop
    tx_cost := tx_cost + coalesce((item->>'cost')::numeric, 0) * greatest(1, coalesce((item->>'quantity')::integer, 1));
    tx_count := tx_count + greatest(1, coalesce((item->>'quantity')::integer, 1));
    for component in select * from jsonb_array_elements(coalesce(item#>'{consumptionSnapshot,ingredients}', '[]'::jsonb)) loop
      select "inStock" into before_qty from public.ingredients where id = (component->>'id')::bigint for update;
      if before_qty is null then raise exception 'Ingredient % no longer exists.', component->>'name'; end if;
      if before_qty < (component->>'quantity')::numeric then raise exception 'Insufficient stock for ingredient %.', component->>'name'; end if;
      after_qty := greatest(0, round(before_qty - (component->>'quantity')::numeric, 4));
      update public.ingredients set "inStock" = after_qty where id = (component->>'id')::bigint;
      insert into public.ingredient_movements("ingredientId","ingredientName","transactionId","receiptNo",type,quantity,unit,"beforeStock","afterStock","staffId","staffName","productName",datetime)
      values ((component->>'id')::bigint, component->>'name', tx.id, tx."receiptNo", 'DEDUCT', (component->>'quantity')::numeric,
        component->>'unit', before_qty, after_qty, tx."staffId", tx."staffName", item->>'name', now_ms);
    end loop;
    for component in select * from jsonb_array_elements(coalesce(item#>'{consumptionSnapshot,inventory}', '[]'::jsonb)) loop
      select "inStock" into before_qty from public.inventory where id = (component->>'id')::bigint for update;
      if before_qty is null then raise exception 'Inventory item % no longer exists.', component->>'name'; end if;
      if before_qty < (component->>'quantity')::numeric then raise exception 'Insufficient stock for inventory item %.', component->>'name'; end if;
      after_qty := greatest(0, round(before_qty - (component->>'quantity')::numeric, 4));
      update public.inventory set "inStock" = after_qty where id = (component->>'id')::bigint;
    end loop;
  end loop;

  insert into public.discount_authorizations("transactionId","receiptNo",type,"idNumber",photo,"itemIndex","unitIndex","productName","advertisedPercent","effectivePercent","discountAmount","staffId","staffName","createdAt")
  select tx.id, tx."receiptNo", a->>'type', a->>'idNumber', a->>'photo', (a->>'itemIndex')::integer,
    (a->>'unitIndex')::integer, a->>'productName', coalesce((a->>'advertisedPercent')::numeric,20),
    coalesce((a->>'effectivePercent')::numeric,17.86), (a->>'discountAmount')::numeric,
    tx."staffId", tx."staffName", now_ms
  from jsonb_array_elements(coalesce(p_authorizations, '[]'::jsonb)) a;

  update public.order_queue set "transactionId" = tx.id, "receiptNo" = tx."receiptNo", status = 'active',
    "orderType" = tx."orderType", "staffId" = tx."staffId", "staffName" = tx."staffName", "queuedAt" = now_ms
  where id = queue_row.id;
  for item, item_index in
    select value, (ordinality - 1)::integer from jsonb_array_elements(tx.items) with ordinality as x(value, ordinality)
  loop
    for unit_no in 0..greatest(0, coalesce((item->>'quantity')::integer,1)-1) loop
      insert into public.order_queue_items("queueId","transactionItemIndex","unitIndex","productId",name,modifiers,served)
      values(queue_row.id, item_index, unit_no, nullif(item->>'productId','')::bigint,
        coalesce(item->>'name','Item'), coalesce(item->'modifiers','[]'::jsonb), false)
      on conflict ("queueId","transactionItemIndex","unitIndex") do nothing;
    end loop;
  end loop;
  update public.pager_state set "lastAssigned" = queue_row."pagerNumber", "updatedAt" = now_ms where id = 1;

  insert into public.daily_sales_summary("businessDate","transactionCount",revenue,cost,profit,"itemCount","updatedAt")
  values ((to_timestamp(tx.datetime / 1000.0) at time zone 'Asia/Manila')::date, 1, tx.total, tx_cost, tx.total - tx_cost, tx_count, now_ms)
  on conflict ("businessDate") do update set
    "transactionCount" = public.daily_sales_summary."transactionCount" + 1,
    revenue = public.daily_sales_summary.revenue + excluded.revenue,
    cost = public.daily_sales_summary.cost + excluded.cost,
    profit = public.daily_sales_summary.profit + excluded.profit,
    "itemCount" = public.daily_sales_summary."itemCount" + excluded."itemCount", "updatedAt" = now_ms;
  insert into public.audit_log(action,entity,"entityId","staffId","staffName",datetime,details,"entityType","afterState")
  values ('CREATE', tx."receiptNo", tx.id, tx."staffId", tx."staffName", now_ms, 'Paid checkout completed atomically', 'transaction',
    jsonb_build_object('receiptNo',tx."receiptNo",'paymentMethod',tx."paymentMethod",'paymentEvidencePresent',tx."paymentEvidencePhoto" is not null,'total',tx.total,'status',tx.status));

  transaction_id := tx.id; queue_id := queue_row.id; pager_number := queue_row."pagerNumber"; queued_at := now_ms;
  return next;
end $$;

create or replace function public.void_pos_transaction(p_transaction_id bigint, p_staff_id bigint, p_pin text, p_reason text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare tx public.transactions%rowtype; item jsonb; component jsonb; now_ms bigint; tx_cost numeric := 0; tx_count integer := 0;
begin
  if not public.is_pos_session_active() then raise exception 'Your POS session has expired. Sign in again.'; end if;
  if not public.verify_staff_pin(p_staff_id, p_pin) then raise exception 'Enter your own six-digit employee PIN.'; end if;
  if not exists(select 1 from public.app_sessions where "userId"=auth.uid() and "staffId"=p_staff_id and "expiresAt">now()) then raise exception 'The PIN must belong to the current session.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'A void reason is required.'; end if;
  now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  select * into tx from public.transactions where id = p_transaction_id for update;
  if tx.id is null then raise exception 'Transaction not found.'; end if;
  if tx.status = 'void' then return true; end if;
  for item in select * from jsonb_array_elements(coalesce(tx.items,'[]'::jsonb)) loop
    tx_cost := tx_cost + coalesce((item->>'cost')::numeric,0) * greatest(1,coalesce((item->>'quantity')::integer,1));
    tx_count := tx_count + greatest(1,coalesce((item->>'quantity')::integer,1));
    if item ? 'consumptionSnapshot' then
      for component in select * from jsonb_array_elements(coalesce(item#>'{consumptionSnapshot,ingredients}','[]'::jsonb)) loop
        update public.ingredients set "inStock" = round(("inStock" + (component->>'quantity')::numeric)::numeric,4)
        where id = (component->>'id')::bigint;
        insert into public.ingredient_movements("ingredientId","ingredientName","transactionId","receiptNo",type,quantity,unit,"beforeStock","afterStock","staffId","staffName","productName",datetime)
        select (component->>'id')::bigint, component->>'name', tx.id, tx."receiptNo", 'RESTOCK', (component->>'quantity')::numeric,
          component->>'unit', i."inStock"-(component->>'quantity')::numeric, i."inStock", p_staff_id, s.name, item->>'name',
          (extract(epoch from clock_timestamp())*1000)::bigint
        from public.ingredients i join public.staff s on s.id=p_staff_id where i.id=(component->>'id')::bigint;
      end loop;
      for component in select * from jsonb_array_elements(coalesce(item#>'{consumptionSnapshot,inventory}','[]'::jsonb)) loop
        update public.inventory set "inStock" = round(("inStock" + (component->>'quantity')::numeric)::numeric,4)
        where id = (component->>'id')::bigint;
      end loop;
    else
      raise exception 'This legacy sale has no exact consumption snapshot; manual stock reconciliation is required.';
    end if;
  end loop;
  update public.transactions set status = 'void' where id = tx.id;
  update public.order_queue set status = 'cancelled', "completedAt" = now_ms where "transactionId" = tx.id and status in ('reserved','active');
  insert into public.void_log("transactionId","receiptNo",reason,"staffId","staffName",datetime,"originalData")
  select tx.id,tx."receiptNo",trim(p_reason),s.id,s.name,now_ms,to_jsonb(tx)-'paymentEvidencePhoto' from public.staff s where s.id=p_staff_id;
  update public.daily_sales_summary set "transactionCount"=greatest(0,"transactionCount"-1), revenue=greatest(0,revenue-tx.total),
    cost=greatest(0,cost-tx_cost), profit=profit-(tx.total-tx_cost), "itemCount"=greatest(0,"itemCount"-tx_count), "updatedAt"=now_ms
  where "businessDate"=(to_timestamp(tx.datetime/1000.0) at time zone 'Asia/Manila')::date;
  insert into public.audit_log(action,entity,"entityId","staffId","staffName",datetime,details,"entityType","beforeState","afterState")
  select 'VOID',tx."receiptNo",tx.id,s.id,s.name,now_ms,'Voided: '||trim(p_reason),'transaction',jsonb_build_object('status',tx.status),jsonb_build_object('status','void') from public.staff s where s.id=p_staff_id;
  return true;
end $$;

create or replace function public.set_queue_item_status(p_item_id bigint, p_served boolean)
returns table("servedAt" bigint, "durationMs" bigint)
language plpgsql security definer set search_path = public as $$
declare queue_start bigint; event_time bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if not public.is_pos_session_active() then raise exception 'Your POS session has expired. Sign in again.'; end if;
  select q."queuedAt" into queue_start from public.order_queue_items i join public.order_queue q on q.id=i."queueId"
  where i.id=p_item_id and q.status='active' for update of i;
  if queue_start is null then raise exception 'Active queue item not found.'; end if;
  update public.order_queue_items set served=p_served, "servedAt"=case when p_served then event_time else null end,
    "durationMs"=case when p_served then greatest(0,event_time-queue_start) else null end where id=p_item_id
  returning public.order_queue_items."servedAt", public.order_queue_items."durationMs" into "servedAt", "durationMs";
  return next;
end $$;

create or replace function public.complete_queue_order(p_queue_id bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare queue_start bigint; event_time bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
  if not public.is_pos_session_active() then raise exception 'Your POS session has expired. Sign in again.'; end if;
  select "queuedAt" into queue_start from public.order_queue where id=p_queue_id and status='active' for update;
  if queue_start is null then raise exception 'Active queue order not found.'; end if;
  if exists(select 1 from public.order_queue_items where "queueId"=p_queue_id and not served) then raise exception 'All items must be served first.'; end if;
  update public.order_queue set status='completed', "completedAt"=event_time, "durationMs"=greatest(0,event_time-queue_start) where id=p_queue_id;
  return event_time;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='product_ingredients_product_fk') then
    alter table public.product_ingredients add constraint product_ingredients_product_fk foreign key ("productId") references public.products(id) on delete cascade not valid;
    alter table public.product_ingredients add constraint product_ingredients_ingredient_fk foreign key ("ingredientId") references public.ingredients(id) on delete restrict not valid;
    alter table public.product_inventory add constraint product_inventory_product_fk foreign key ("productId") references public.products(id) on delete cascade not valid;
    alter table public.product_inventory add constraint product_inventory_inventory_fk foreign key ("inventoryId") references public.inventory(id) on delete restrict not valid;
  end if;
end $$;
create index if not exists idx_product_ingredients_product on public.product_ingredients("productId");
create index if not exists idx_product_inventory_product on public.product_inventory("productId");
create index if not exists idx_transactions_datetime_status on public.transactions(datetime,status);
create index if not exists idx_transactions_staff_datetime on public.transactions("staffId",datetime);

create or replace view public.staff_directory with (security_invoker=true) as
select id, name, role, "hourlyRate", "profileImage", ("pinHash" is not null) as "hasPin"
from public.staff;
revoke all on public.staff_directory from anon;
grant select, delete on public.staff_directory to authenticated;
revoke select on public.staff from anon, authenticated;

do $$ declare tbl text; begin
  foreach tbl in array array[
    'categories','subcategories','customers','membership_cards','loyalty_transactions','products','inventory','ingredients',
    'product_ingredients','product_inventory','modifier_groups','modifier_options','modifier_option_ingredients','modifier_option_inventory',
    'transactions','running_bills','discount_authorizations','order_queue','order_queue_items','daily_sales_summary',
    'ingredient_movements','cash_drawer','time_records','void_log','audit_log','pager_state'
  ] loop
    execute format('drop policy if exists "Allow app access" on public.%I',tbl);
    execute format('drop policy if exists "POS session access" on public.%I',tbl);
    execute format('drop policy if exists "POS read" on public.%I',tbl);
    execute format('drop policy if exists "Owner manage" on public.%I',tbl);
    execute format('create policy "POS session access" on public.%I for all to authenticated using (public.is_pos_session_active()) with check (public.is_pos_session_active())',tbl);
  end loop;
end $$;
do $$ declare tbl text; begin
  foreach tbl in array array['categories','subcategories','products','inventory','ingredients','product_ingredients','product_inventory','modifier_groups','modifier_options','modifier_option_ingredients','modifier_option_inventory'] loop
    execute format('drop policy if exists "POS session access" on public.%I',tbl);
    execute format('create policy "POS read" on public.%I for select to authenticated using (public.is_pos_session_active())',tbl);
    execute format('create policy "Owner manage" on public.%I for all to authenticated using (public.current_pos_role()=''owner'') with check (public.current_pos_role()=''owner'')',tbl);
  end loop;
end $$;
drop policy if exists "Staff directory access" on public.staff;
drop policy if exists "Allow app access" on public.staff;
drop policy if exists "Owner delete staff" on public.staff;
create policy "Staff directory access" on public.staff for select to authenticated using(public.is_pos_session_active());
create policy "Owner delete staff" on public.staff for delete to authenticated using(public.current_pos_role()='owner');
revoke all on public.staff from anon, authenticated;
grant select(id,name,role,"hourlyRate","profileImage") on public.staff to authenticated;
grant delete on public.staff to authenticated;

drop policy if exists "POS session access" on public.audit_log;
drop policy if exists "Audit read" on public.audit_log;
drop policy if exists "Audit append" on public.audit_log;
create policy "Audit read" on public.audit_log for select to authenticated using(public.current_pos_role()='owner');
create policy "Audit append" on public.audit_log for insert to authenticated with check(public.is_pos_session_active());
drop policy if exists "POS session access" on public.transactions;
drop policy if exists "Transaction read" on public.transactions;
create policy "Transaction read" on public.transactions for select to authenticated using(public.is_pos_session_active());
revoke insert, update, delete on public.transactions from anon, authenticated;
drop policy if exists "POS session access" on public.discount_authorizations;
drop policy if exists "Discount evidence read" on public.discount_authorizations;
create policy "Discount evidence read" on public.discount_authorizations for select to authenticated using(public.is_pos_session_active());
revoke insert, update, delete on public.discount_authorizations from anon, authenticated;

revoke execute on function public.authenticate_staff(text) from public;
revoke execute on function public.end_pos_session() from public;
revoke execute on function public.staff_count() from public;
revoke execute on function public.verify_staff_pin(bigint,text) from public;
revoke execute on function public.save_staff_record(bigint,text,text,numeric,text,text) from public;
revoke execute on function public.finalize_pos_checkout(jsonb,jsonb,text) from public;
revoke execute on function public.void_pos_transaction(bigint,bigint,text,text) from public;
revoke execute on function public.set_queue_item_status(bigint,boolean) from public;
revoke execute on function public.complete_queue_order(bigint) from public;
revoke execute on function public.reserve_next_pager(text,bigint,text) from public;
revoke execute on function public.cancel_pager_reservation(text) from public;
revoke execute on function public.activate_reserved_queue(text,bigint,text,text,bigint,text,jsonb) from public;
revoke execute on function public.adjust_ingredient_stock(bigint,numeric) from public;
grant execute on function public.authenticate_staff(text), public.end_pos_session(), public.staff_count(), public.verify_staff_pin(bigint,text),
  public.save_staff_record(bigint,text,text,numeric,text,text), public.finalize_pos_checkout(jsonb,jsonb,text),
  public.void_pos_transaction(bigint,bigint,text,text), public.set_queue_item_status(bigint,boolean),
  public.complete_queue_order(bigint) to authenticated;
grant execute on function public.reserve_next_pager(text,bigint,text), public.cancel_pager_reservation(text),
  public.activate_reserved_queue(text,bigint,text,text,bigint,text,jsonb), public.adjust_ingredient_stock(bigint,numeric) to authenticated;
grant execute on function public.staff_count(), public.save_staff_record(bigint,text,text,numeric,text,text) to authenticated;
