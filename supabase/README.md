# Supabase Setup Steps

## 1) Run SQL migration

Open Supabase Dashboard -> SQL Editor and run:

`supabase/migrations/20260306_marketplace_full.sql`

This migration does:
- Backup current tables (`products`, `my_products`, `orders`, `partners_requests`).
- Add new columns to current tables.
- Create marketplace tables (`profiles`, `sellers`, `categories`, `product_images`, `order_items`, `payouts`, `reviews`, `payment_transactions`, `platform_settings`).
- Migrate data from `my_products` to `products`.
- Enable RLS and create policies.
- Create storage bucket `product-images`.

## 2) Deploy edge functions

Deploy these functions:
- `payment-create`
- `payment-webhook`
- `payout-create`
- `payout-webhook`

Required env vars:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYMENT_PROVIDER` (use `mock` now)

## 3) Create Auth users

Create admin/seller users in Supabase Auth, then ensure role exists in `profiles.role`:
- `admin`
- `seller`
- `buyer`

## 4) Frontend pages already wired

The dashboard pages now use:
- `pages/supabase-client.js` for auth/session/profile role.
- Supabase Auth login (`pages/login.html` + `pages/main.js`).
