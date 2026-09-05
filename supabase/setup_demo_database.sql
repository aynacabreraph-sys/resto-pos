-- Run this ONCE in a brand-new Supabase project (SQL Editor → New query → Run).
-- It creates empty tables. The app fills in demo staff + menu on first open.
-- Apply every file in supabase/migrations afterward; the final hardening migration
-- installs hashed PIN login, authenticated POS sessions, and atomic checkout.

-- Core tables
create table if not exists public.staff (
  id bigserial primary key,
  name text not null,
  pin text,
  "pinHash" text,
  role text not null default 'cashier',
  "hourlyRate" numeric(12,2) not null default 0,
  "profileImage" text
);

create table if not exists public.products (
  id bigserial primary key,
  name text not null,
  category text,
  "subCategory" text,
  price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  "directLaborCost" numeric(12,2) not null default 0,
  "isAvailable" boolean not null default true,
  emoji text
);

create table if not exists public.ingredients (
  id bigserial primary key,
  name text not null,
  unit text,
  "inStock" numeric(14,4) not null default 0,
  "unitCost" numeric(12,2) not null default 0,
  "lowThreshold" numeric(14,4) not null default 0
);

create table if not exists public.inventory (
  id bigserial primary key,
  name text not null,
  category text,
  "inStock" numeric(14,4) not null default 0,
  price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0
);

create table if not exists public.product_ingredients (
  id bigserial primary key,
  "productId" bigint not null,
  "ingredientId" bigint not null,
  quantity numeric(14,4) not null default 0
);

create table if not exists public.product_inventory (
  id bigserial primary key,
  "productId" bigint not null,
  "inventoryId" bigint not null,
  quantity numeric(14,4) not null default 0
);

create table if not exists public.transactions (
  id bigserial primary key,
  "receiptNo" text not null,
  "checkoutKey" text,
  datetime bigint not null,
  "orderType" text,
  items jsonb not null default '[]'::jsonb,
  "paymentMethod" text,
  "paymentLines" jsonb not null default '[]'::jsonb,
  "orderDiscount" numeric(6,2) not null default 0,
  "orderMarkup" numeric(6,2) not null default 0,
  "orderDiscountAmount" numeric(12,2) not null default 0,
  "orderMarkupAmount" numeric(12,2) not null default 0,
  subtotal numeric(12,2),
  "customerId" bigint,
  "customerName" text,
  "memberCode" text,
  "loyaltyEarned" integer not null default 0,
  "loyaltyRedeemed" integer not null default 0,
  "loyaltyDiscount" numeric(12,2) not null default 0,
  "birthdayRewardRedeemed" boolean not null default false,
  "discountTotal" numeric(12,2) not null default 0,
  "discountAuthorizationCount" integer not null default 0,
  total numeric(12,2) not null default 0,
  "cashReceived" numeric(12,2),
  "paymentEvidencePhoto" text,
  "paymentEvidenceRequired" boolean not null default false,
  "staffId" bigint,
  "staffName" text,
  status text not null default 'completed'
);

create table if not exists public.cash_drawer (
  id bigserial primary key,
  type text not null,
  amount numeric(12,2) not null,
  notes text,
  "staffId" bigint,
  "staffName" text,
  datetime bigint not null
);

create table if not exists public.time_records (
  id bigserial primary key,
  "staffId" bigint not null,
  date text not null,
  "timeIn" bigint,
  "photoIn" text,
  "timeOut" bigint,
  "photoOut" text,
  "salaryEarned" numeric(12,2) not null default 0
);

create table if not exists public.void_log (
  id bigserial primary key,
  "transactionId" bigint,
  "receiptNo" text,
  reason text,
  "staffId" bigint,
  "staffName" text,
  datetime bigint not null,
  "originalData" jsonb
);

create table if not exists public.audit_log (
  id bigserial primary key,
  action text not null,
  entity text,
  "entityId" bigint,
  "staffId" bigint,
  "staffName" text,
  datetime bigint not null,
  details text,
  "entityType" text,
  "beforeState" jsonb,
  "afterState" jsonb
);

create table if not exists public.daily_sales_summary (
  id bigserial primary key,
  "businessDate" date not null unique,
  "transactionCount" integer not null default 0 check ("transactionCount" >= 0),
  revenue numeric(12,2) not null default 0 check (revenue >= 0),
  cost numeric(12,2) not null default 0 check (cost >= 0),
  profit numeric(12,2) not null default 0,
  "itemCount" integer not null default 0 check ("itemCount" >= 0),
  "updatedAt" bigint not null
);

create table if not exists public.ingredient_movements (
  id bigserial primary key,
  "ingredientId" bigint not null,
  "ingredientName" text,
  "transactionId" bigint,
  "receiptNo" text,
  type text not null check (type in ('DEDUCT', 'RESTOCK', 'ADJUST')),
  quantity numeric(14,4) not null check (quantity >= 0),
  unit text,
  "beforeStock" numeric(14,4) not null,
  "afterStock" numeric(14,4) not null,
  "staffId" bigint,
  "staffName" text,
  "productName" text,
  datetime bigint not null
);

create table if not exists public.running_bills (
  id bigserial primary key,
  "tableName" text not null,
  items jsonb not null default '[]'::jsonb,
  "orderType" text not null default 'Dine In',
  total numeric(12,2) not null default 0,
  status text not null default 'open' check (status in ('open', 'closed')),
  "staffId" bigint,
  "staffName" text,
  "openedAt" bigint not null,
  "updatedAt" bigint not null,
  "closedAt" bigint,
  "transactionId" bigint,
  "orderDiscount" numeric(6,2) not null default 0,
  "orderMarkup" numeric(6,2) not null default 0,
  "orderDiscountAmount" numeric(12,2) not null default 0,
  "orderMarkupAmount" numeric(12,2) not null default 0
);

create table if not exists public.customers (
  id bigint generated by default as identity primary key,
  "memberCode" text not null unique,
  name text not null,
  phone text,
  birthday date,
  "pointsBalance" integer not null default 0,
  status text not null default 'active',
  "createdAt" bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  "updatedAt" bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  "cardId" bigint,
  "activatedAt" bigint,
  "expiresAt" bigint,
  "birthdayRewardYear" integer
);

create table if not exists public.loyalty_transactions (
  id bigint generated by default as identity primary key,
  "customerId" bigint references public.customers(id) on delete set null,
  "customerName" text,
  "memberCode" text,
  "transactionId" bigint,
  "receiptNo" text,
  type text not null,
  points integer not null,
  amount numeric(12,2) not null default 0,
  "beforePoints" integer not null default 0,
  "afterPoints" integer not null default 0,
  details text,
  "staffId" bigint,
  "staffName" text,
  datetime bigint not null
);

create table if not exists public.membership_cards (
  id bigint generated by default as identity primary key,
  "cardCode" text not null unique,
  status text not null default 'available',
  "customerId" bigint references public.customers(id) on delete set null,
  "customerName" text,
  "batchName" text,
  "createdAt" bigint not null default ((extract(epoch from now()) * 1000)::bigint),
  "activatedAt" bigint,
  "disabledAt" bigint,
  notes text,
  "expiresAt" bigint
);

-- Operational configuration (membership/split-payment/running-bill tables above are legacy-compatible).
create table if not exists public.categories (
  id bigint generated by default as identity primary key, name text not null,
  "sortOrder" integer not null default 0, active boolean not null default true
);
create unique index if not exists idx_categories_name_ci on public.categories (lower(name));
create table if not exists public.subcategories (
  id bigint generated by default as identity primary key,
  "categoryId" bigint not null references public.categories(id) on delete restrict,
  name text not null, "sortOrder" integer not null default 0, active boolean not null default true
);
create unique index if not exists idx_subcategories_category_name_ci on public.subcategories ("categoryId", lower(name));
insert into public.categories (name, "sortOrder") values ('Drinks',1),('Food',2),('Takeout Box',3) on conflict do nothing;
insert into public.subcategories ("categoryId", name, "sortOrder")
select c.id, s.name, s.sort_order from (values
 ('Drinks','Coffee',1),('Drinks','Non coffee',2),('Drinks','Frappe',3),('Drinks','Fruit-Blended',4),
 ('Drinks','Refreshing Beverage',5),('Drinks','Milk Tea and Tea',6),('Food','Starters',1),('Food','Salad',2),
 ('Food','Rice Meal',3),('Food','Pasta',4),('Food','Sandwich and Burger',5),('Food','Pizza and Quesadilla',6),
 ('Food','Dessert',7),('Takeout Box','Takeout Box',1)
) s(category_name,name,sort_order) join public.categories c on c.name=s.category_name on conflict do nothing;

create table if not exists public.modifier_groups (
 id bigint generated by default as identity primary key, "productId" bigint not null references public.products(id) on delete cascade,
 name text not null, required boolean not null default false,
 "selectionMode" text not null default 'single' check ("selectionMode" in ('single','multiple')),
 "minSelections" integer not null default 0 check ("minSelections">=0), "maxSelections" integer not null default 1 check ("maxSelections">=1),
 "sortOrder" integer not null default 0, active boolean not null default true
);
create table if not exists public.modifier_options (
 id bigint generated by default as identity primary key, "groupId" bigint not null references public.modifier_groups(id) on delete cascade,
 name text not null, "priceDelta" numeric(12,2) not null default 0, "sortOrder" integer not null default 0, active boolean not null default true
);
create table if not exists public.modifier_option_ingredients (
 id bigint generated by default as identity primary key, "optionId" bigint not null references public.modifier_options(id) on delete cascade,
 "ingredientId" bigint not null references public.ingredients(id) on delete restrict, quantity numeric(14,4) not null check(quantity>0), unique("optionId","ingredientId")
);
create table if not exists public.modifier_option_inventory (
 id bigint generated by default as identity primary key, "optionId" bigint not null references public.modifier_options(id) on delete cascade,
 "inventoryId" bigint not null references public.inventory(id) on delete restrict, quantity numeric(14,4) not null check(quantity>0), unique("optionId","inventoryId")
);
create table if not exists public.discount_authorizations (
 id bigint generated by default as identity primary key, "transactionId" bigint not null references public.transactions(id) on delete cascade,
 "receiptNo" text, type text not null check(type in ('PWD','Senior')), "idNumber" text not null, photo text not null,
 "itemIndex" integer not null, "unitIndex" integer not null, "productName" text,
 "advertisedPercent" numeric(6,2) not null default 20, "effectivePercent" numeric(6,2) not null default 17.86,
 "discountAmount" numeric(12,2) not null, "staffId" bigint, "staffName" text, "createdAt" bigint not null,
 unique("transactionId","idNumber")
);
create table if not exists public.pager_state (
 id integer primary key default 1 check(id=1), "lastAssigned" integer not null default 0 check("lastAssigned" between 0 and 10), "updatedAt" bigint not null default 0
);
insert into public.pager_state(id,"lastAssigned","updatedAt") values(1,0,0) on conflict(id) do nothing;
create table if not exists public.order_queue (
 id bigint generated by default as identity primary key, "checkoutKey" text not null unique,
 "transactionId" bigint references public.transactions(id) on delete set null, "receiptNo" text,
 "pagerNumber" integer not null check("pagerNumber" between 1 and 10),
 status text not null default 'reserved' check(status in ('reserved','active','completed','cancelled')),
 "orderType" text, "staffId" bigint, "staffName" text, "reservedAt" bigint not null, "queuedAt" bigint,
 "pagerHandedAt" bigint, "completedAt" bigint, "durationMs" bigint
);
create unique index if not exists idx_order_queue_active_pager on public.order_queue("pagerNumber") where status in ('reserved','active');
create index if not exists idx_order_queue_completed_at on public.order_queue("completedAt" desc) where status = 'completed';
create table if not exists public.order_queue_items (
 id bigint generated by default as identity primary key, "queueId" bigint not null references public.order_queue(id) on delete cascade,
 "transactionItemIndex" integer not null, "unitIndex" integer not null, "productId" bigint, name text not null,
 modifiers jsonb not null default '[]'::jsonb, served boolean not null default false, "servedAt" bigint, "durationMs" bigint,
 unique("queueId","transactionItemIndex","unitIndex")
);

-- Indexes
create index if not exists idx_transactions_datetime on public.transactions (datetime);
create unique index if not exists idx_transactions_receipt_no on public.transactions ("receiptNo");
create index if not exists idx_transactions_status_datetime on public.transactions (status, datetime);
create unique index if not exists idx_transactions_checkout_key on public.transactions ("checkoutKey") where "checkoutKey" is not null;
create index if not exists idx_audit_log_datetime on public.audit_log (datetime);
create index if not exists idx_audit_log_entity_datetime on public.audit_log (entity, datetime);
create index if not exists idx_void_log_datetime on public.void_log (datetime);
create index if not exists idx_ingredient_movements_ingredient_datetime on public.ingredient_movements ("ingredientId", datetime);
create index if not exists idx_daily_sales_summary_business_date on public.daily_sales_summary ("businessDate");
create index if not exists idx_running_bills_status_updated on public.running_bills (status, "updatedAt");
create index if not exists idx_customers_member_code on public.customers ("memberCode");
create index if not exists idx_customers_name on public.customers (name);
create index if not exists idx_customers_expires_at on public.customers ("expiresAt");
create index if not exists idx_loyalty_customer_datetime on public.loyalty_transactions ("customerId", datetime desc);
create index if not exists idx_loyalty_receipt_no on public.loyalty_transactions ("receiptNo");
create index if not exists idx_membership_cards_code on public.membership_cards ("cardCode");
create index if not exists idx_membership_cards_status on public.membership_cards (status);
create index if not exists idx_membership_cards_customer on public.membership_cards ("customerId");
create index if not exists idx_membership_cards_expires_at on public.membership_cards ("expiresAt");
create index if not exists idx_time_records_staff_date on public.time_records ("staffId", "date");
create unique index if not exists idx_staff_pin_unique on public.staff (pin) where pin is not null;

-- Constraints
alter table public.products add constraint products_price_nonnegative check (price >= 0);
alter table public.products add constraint products_cost_nonnegative check (cost >= 0);
alter table public.products add constraint products_direct_labor_cost_nonnegative check ("directLaborCost" >= 0);
alter table public.transactions add constraint transactions_payment_evidence_required check (
  not "paymentEvidenceRequired"
  or ("paymentMethod" in ('GCash','Bank Transfer') and nullif("paymentEvidencePhoto", '') is not null)
);
alter table public.ingredients add constraint ingredients_stock_nonnegative check ("inStock" >= 0);
alter table public.inventory add constraint inventory_stock_nonnegative check ("inStock" >= 0);
alter table public.staff add constraint staff_pin_six_digits check (pin is null or pin ~ '^[0-9]{6}$');

-- Stock adjustment function
create or replace function public.adjust_ingredient_stock(
  p_ingredient_id bigint,
  p_delta numeric
)
returns table(before_stock numeric, after_stock numeric)
language plpgsql
as $$
declare
  current_stock numeric;
begin
  select "inStock" into current_stock from public.ingredients where id = p_ingredient_id for update;
  if current_stock is null then return; end if;
  before_stock := current_stock;
  after_stock := greatest(0, current_stock + p_delta);
  update public.ingredients set "inStock" = after_stock where id = p_ingredient_id;
  return next;
end;
$$;

create or replace function public.reserve_next_pager(p_checkout_key text, p_staff_id bigint default null, p_staff_name text default null)
returns table(queue_id bigint, pager_number integer) language plpgsql as $$
declare last_number integer; candidate integer; i integer; now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
 update public.order_queue set status='cancelled' where status='reserved' and "reservedAt" < now_ms-300000;
 select id,"pagerNumber" into queue_id,pager_number from public.order_queue where "checkoutKey"=p_checkout_key and status in ('reserved','active');
 if queue_id is not null then return next; return; end if;
 select "lastAssigned" into last_number from public.pager_state where id=1 for update;
 for i in 1..10 loop
  candidate:=((last_number+i-1)%10)+1;
  if not exists(select 1 from public.order_queue where "pagerNumber"=candidate and status in ('reserved','active')) then
   insert into public.order_queue("checkoutKey","pagerNumber",status,"staffId","staffName","reservedAt")
   values(p_checkout_key,candidate,'reserved',p_staff_id,p_staff_name,now_ms) returning id into queue_id;
   pager_number:=candidate; return next; return;
  end if;
 end loop;
 raise exception 'All pagers are currently in use.' using errcode='P0001';
end; $$;
create or replace function public.cancel_pager_reservation(p_checkout_key text)
returns void language sql as $$ update public.order_queue set status='cancelled' where "checkoutKey"=p_checkout_key and status='reserved' $$;

create or replace function public.activate_reserved_queue(
 p_checkout_key text, p_transaction_id bigint, p_receipt_no text, p_order_type text,
 p_staff_id bigint, p_staff_name text, p_items jsonb
)
returns table(queue_id bigint, pager_number integer, queued_at bigint) language plpgsql as $$
declare queue_row public.order_queue%rowtype; now_ms bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
 select * into queue_row from public.order_queue where "checkoutKey"=p_checkout_key for update;
 if queue_row.id is null then raise exception 'Pager reservation was not found.' using errcode='P0001'; end if;
 if queue_row.status in ('active','completed') then
  queue_id:=queue_row.id; pager_number:=queue_row."pagerNumber"; queued_at:=queue_row."queuedAt"; return next; return;
 end if;
 if queue_row.status<>'reserved' then raise exception 'Pager reservation is no longer active.' using errcode='P0001'; end if;
 perform 1 from public.pager_state where id=1 for update;
 update public.order_queue set "transactionId"=p_transaction_id,"receiptNo"=p_receipt_no,status='active',
  "orderType"=p_order_type,"staffId"=p_staff_id,"staffName"=p_staff_name,"queuedAt"=now_ms where id=queue_row.id;
 insert into public.order_queue_items("queueId","transactionItemIndex","unitIndex","productId",name,modifiers,served)
 select queue_row.id,item_ordinality::integer-1,unit_ordinality-1,nullif(item->>'productId','')::bigint,
  coalesce(nullif(item->>'name',''),'Item'),coalesce(item->'modifiers','[]'::jsonb),false
 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality as expanded(item,item_ordinality)
 cross join lateral generate_series(1,greatest(1,coalesce(nullif(item->>'quantity','')::integer,1))) as generated(unit_ordinality)
 on conflict("queueId","transactionItemIndex","unitIndex") do nothing;
 update public.pager_state set "lastAssigned"=queue_row."pagerNumber","updatedAt"=now_ms where id=1;
 queue_id:=queue_row.id; pager_number:=queue_row."pagerNumber"; queued_at:=now_ms; return next;
end; $$;

-- Time tracking duplicate guard
create or replace function public.prevent_duplicate_time_record_day()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new."staffId"::text || ':' || new."date"::text));
  if exists (
    select 1 from public.time_records
    where "staffId" = new."staffId" and "date" = new."date" and id <> coalesce(new.id, -1)
  ) then
    raise exception 'A time record already exists for this staff member on this date.' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_time_record_day on public.time_records;
create trigger trg_prevent_duplicate_time_record_day
  before insert or update of "staffId", "date" on public.time_records
  for each row execute function public.prevent_duplicate_time_record_day();

-- Permissions + RLS (app uses anon key)
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'staff','products','ingredients','inventory','product_ingredients','product_inventory',
    'transactions','cash_drawer','time_records','void_log','audit_log',
    'daily_sales_summary','ingredient_movements','running_bills',
    'customers','loyalty_transactions','membership_cards',
    'categories','subcategories','modifier_groups','modifier_options','modifier_option_ingredients',
    'modifier_option_inventory','discount_authorizations','pager_state','order_queue','order_queue_items'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', tbl);
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists "Allow app access" on public.%I', tbl);
    execute format(
      'create policy "Allow app access" on public.%I for all to anon, authenticated using (true) with check (true)',
      tbl
    );
  end loop;
end $$;

grant execute on function public.adjust_ingredient_stock(bigint, numeric) to anon, authenticated;
grant execute on function public.reserve_next_pager(text,bigint,text) to anon, authenticated;
grant execute on function public.cancel_pager_reservation(text) to anon, authenticated;
grant execute on function public.activate_reserved_queue(text,bigint,text,text,bigint,text,jsonb) to anon, authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;
