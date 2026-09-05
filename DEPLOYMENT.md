# POS deployment checklist

1. In Supabase Authentication, enable **Anonymous Sign-Ins**. The browser receives a short-lived device identity; the employee PIN then creates a 12-hour POS session.
2. Apply every SQL migration in timestamp order, including `20260825_full_sweep_hardening.sql`. With the Supabase CLI, use `supabase db push`.
3. Deploy the Vite app with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never expose the service-role key in the browser.
4. For a non-demo empty database, create the first owner through the `save_staff_record` RPC while the staff table is empty. No universal default owner PIN is created anymore.
5. Test login, one cash sale, one electronic-evidence sale, a void, pager completion, and a redacted backup before opening the register.

The hardening migration hashes existing PINs, replaces public operational policies with authenticated POS-session policies, restricts catalog mutations to owners, and makes checkout/void/queue completion database-atomic. Existing transaction and queue history remains intact.
