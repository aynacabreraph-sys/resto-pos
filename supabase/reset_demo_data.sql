-- Wipes all operational data from a Supabase project.
-- Run in SQL Editor on a dedicated demo instance — NOT your live client database.

truncate table public.loyalty_transactions restart identity cascade;
truncate table public.membership_cards restart identity cascade;
truncate table public.customers restart identity cascade;
truncate table public.product_ingredients restart identity cascade;
truncate table public.product_inventory restart identity cascade;
truncate table public.modifier_option_ingredients restart identity cascade;
truncate table public.modifier_option_inventory restart identity cascade;
truncate table public.modifier_options restart identity cascade;
truncate table public.modifier_groups restart identity cascade;
truncate table public.ingredient_movements restart identity cascade;
truncate table public.running_bills restart identity cascade;
truncate table public.discount_authorizations restart identity cascade;
truncate table public.order_queue_items restart identity cascade;
truncate table public.order_queue restart identity cascade;
update public.pager_state set "lastAssigned" = 0, "updatedAt" = 0 where id = 1;
truncate table public.transactions restart identity cascade;
truncate table public.daily_sales_summary restart identity cascade;
truncate table public.void_log restart identity cascade;
truncate table public.audit_log restart identity cascade;
truncate table public.time_records restart identity cascade;
truncate table public.cash_drawer restart identity cascade;
truncate table public.products restart identity cascade;
truncate table public.inventory restart identity cascade;
truncate table public.ingredients restart identity cascade;
truncate table public.staff restart identity cascade;
