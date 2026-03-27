-- Marketplace v1 migration
-- Run this file in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- -----------------------------
-- 1) Backups for critical tables
-- -----------------------------
do $$
declare
  suffix text := to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS');
begin
  if to_regclass('public.products') is not null then
    execute format('create table if not exists public.products_backup_%s as table public.products', suffix);
  end if;

  if to_regclass('public.my_products') is not null then
    execute format('create table if not exists public.my_products_backup_%s as table public.my_products', suffix);
  end if;

  if to_regclass('public.orders') is not null then
    execute format('create table if not exists public.orders_backup_%s as table public.orders', suffix);
  end if;

  if to_regclass('public.partners_requests') is not null then
    execute format('create table if not exists public.partners_requests_backup_%s as table public.partners_requests', suffix);
  end if;
end $$;

-- -----------------------------
-- 2) Utility functions/triggers
-- -----------------------------
create or replace function public.set_current_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------
-- 3) Core marketplace tables
-- -----------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  phone text,
  full_name text,
  role text not null default 'buyer' check (role in ('buyer', 'seller', 'admin')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  store_name text not null default '',
  bio text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  kyc_data jsonb not null default '{}'::jsonb,
  payout_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_sellers_user_id_unique
  on public.sellers(user_id)
  where user_id is not null;

create table if not exists public.categories (
  id bigserial primary key,
  name text not null unique,
  parent_id bigint references public.categories(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  currency text not null default 'EGP',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  payment_provider text,
  provider_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value, description)
values ('platform_fee_rate', '0.10'::jsonb, 'Default platform fee rate')
on conflict (key) do nothing;

-- -----------------------------
-- 4) Existing tables migration
-- -----------------------------
alter table if exists public.products
  add column if not exists name text,
  add column if not exists image text,
  add column if not exists extra_links text,
  add column if not exists category text,
  add column if not exists description text,
  add column if not exists stock int default 0,
  add column if not exists price numeric(12,2) default 0,
  add column if not exists price_after_discount numeric(12,2) default 0,
  add column if not exists seller_id uuid,
  add column if not exists title text,
  add column if not exists slug text,
  add column if not exists currency text default 'EGP',
  add column if not exists status text default 'draft',
  add column if not exists attributes jsonb default '{}'::jsonb,
  add column if not exists sku text,
  add column if not exists shipping_info jsonb default '{}'::jsonb,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists published_at timestamptz,
  add column if not exists legacy_my_products_id text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.orders
  add column if not exists total_price numeric(12,2),
  add column if not exists buyer_id uuid,
  add column if not exists seller_id uuid,
  add column if not exists total numeric(12,2),
  add column if not exists currency text default 'EGP',
  add column if not exists subtotal numeric(12,2),
  add column if not exists shipping_fee numeric(12,2) default 0,
  add column if not exists platform_fee numeric(12,2) default 0,
  add column if not exists net_to_seller numeric(12,2) default 0,
  add column if not exists payment_status text default 'pending',
  add column if not exists payment_provider text,
  add column if not exists payment_ref text,
  add column if not exists paid_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists items_snapshot jsonb default '[]'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table if exists public.partners_requests
  add column if not exists user_id uuid,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_notes text,
  add column if not exists kyc_data jsonb default '{}'::jsonb,
  add column if not exists payout_profile jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if to_regclass('public.products') is not null and not exists (
    select 1 from pg_constraint where conname = 'products_seller_id_fkey'
  ) then
    alter table public.products
      add constraint products_seller_id_fkey
      foreign key (seller_id) references public.sellers(id) on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.orders') is not null and not exists (
    select 1 from pg_constraint where conname = 'orders_seller_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_seller_id_fkey
      foreign key (seller_id) references public.sellers(id) on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.products') is not null then
    execute $sql$
      update public.products
      set status = case
        when status in ('draft', 'pending_review', 'published', 'rejected') then status
        when status in ('reviewed') then 'published'
        when status in ('pending', 'in_review') then 'pending_review'
        else 'draft'
      end
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.orders') is not null then
    execute $sql$
      update public.orders
      set status = case
        when status = 'delivered' then 'completed'
        when status in ('pending', 'paid', 'preparing', 'shipped', 'completed', 'cancelled') then status
        else 'pending'
      end
    $sql$;

    execute $sql$
      update public.orders
      set payment_status = case
        when payment_status in ('pending', 'paid', 'failed', 'refunded') then payment_status
        else 'pending'
      end
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.orders') is not null and not exists (
    select 1 from pg_constraint where conname = 'orders_buyer_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_buyer_id_fkey
      foreign key (buyer_id) references public.profiles(id) on delete set null;
  end if;
end $$;

do $$
begin
  if to_regclass('public.products') is not null and not exists (
    select 1 from pg_constraint where conname = 'products_status_check'
  ) then
    alter table public.products
      add constraint products_status_check
      check (status in ('draft', 'pending_review', 'published', 'rejected'));
  end if;
end $$;

do $$
begin
  if to_regclass('public.orders') is not null and not exists (
    select 1 from pg_constraint where conname = 'orders_status_check'
  ) then
    alter table public.orders
      add constraint orders_status_check
      check (status in ('pending', 'paid', 'preparing', 'shipped', 'completed', 'cancelled'));
  end if;
end $$;

do $$
begin
  if to_regclass('public.orders') is not null and not exists (
    select 1 from pg_constraint where conname = 'orders_payment_status_check'
  ) then
    alter table public.orders
      add constraint orders_payment_status_check
      check (payment_status in ('pending', 'paid', 'failed', 'refunded'));
  end if;
end $$;

-- -----------------------------
-- 5) Related tables with dynamic FK id types
-- -----------------------------
do $$
declare
  product_id_type text := 'uuid';
begin
  if to_regclass('public.products') is not null then
    select pg_catalog.format_type(a.atttypid, a.atttypmod)
      into product_id_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'products'
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;

    execute format($sql$
      create table if not exists public.product_images (
        id bigserial primary key,
        product_id %s not null references public.products(id) on delete cascade,
        url text not null,
        position int not null default 0,
        created_at timestamptz not null default now()
      )
    $sql$, product_id_type);
  end if;
end $$;

do $$
declare
  order_id_type text := 'uuid';
  product_id_type text := 'uuid';
begin
  if to_regclass('public.orders') is not null then
    select pg_catalog.format_type(a.atttypid, a.atttypmod)
      into order_id_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'orders'
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;
  end if;

  if to_regclass('public.products') is not null then
    select pg_catalog.format_type(a.atttypid, a.atttypmod)
      into product_id_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'products'
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;
  end if;

  if to_regclass('public.orders') is not null then
    execute format($sql$
      create table if not exists public.order_items (
        id bigserial primary key,
        order_id %s not null references public.orders(id) on delete cascade,
        product_id %s references public.products(id) on delete set null,
        seller_id uuid references public.sellers(id) on delete set null,
        product_title text,
        quantity int not null default 1,
        unit_price numeric(12,2) not null default 0,
        total numeric(12,2) not null default 0,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    $sql$, order_id_type, product_id_type);
  end if;
end $$;

do $$
declare
  product_id_type text := 'uuid';
begin
  if to_regclass('public.products') is not null then
    select pg_catalog.format_type(a.atttypid, a.atttypmod)
      into product_id_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'products'
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;

    execute format($sql$
      create table if not exists public.reviews (
        id uuid primary key default gen_random_uuid(),
        product_id %s not null references public.products(id) on delete cascade,
        user_id uuid not null references public.profiles(id) on delete cascade,
        rating int not null check (rating between 1 and 5),
        comment text,
        created_at timestamptz not null default now()
      )
    $sql$, product_id_type);
  end if;
end $$;

do $$
declare
  order_id_type text := 'uuid';
begin
  if to_regclass('public.orders') is not null then
    select pg_catalog.format_type(a.atttypid, a.atttypmod)
      into order_id_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'orders'
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;

    execute format($sql$
      create table if not exists public.payment_transactions (
        id uuid primary key default gen_random_uuid(),
        order_id %s references public.orders(id) on delete set null,
        provider text not null,
        provider_ref text,
        amount numeric(12,2) not null default 0,
        currency text not null default 'EGP',
        status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
        payload jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    $sql$, order_id_type);
  end if;
end $$;

-- -----------------------------
-- 6) Indexes
-- -----------------------------
create unique index if not exists idx_products_slug_unique
  on public.products(slug)
  where slug is not null;

create index if not exists idx_products_status on public.products(status);
create index if not exists idx_products_category on public.products(category);
create index if not exists idx_products_seller_id on public.products(seller_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_payment_status on public.orders(payment_status);
create index if not exists idx_orders_buyer_id on public.orders(buyer_id);
create index if not exists idx_orders_seller_id on public.orders(seller_id);
create index if not exists idx_partners_requests_status on public.partners_requests(status);
create index if not exists idx_payouts_seller_status on public.payouts(seller_id, status);
create index if not exists idx_payment_transactions_ref on public.payment_transactions(provider_ref);

-- -----------------------------
-- 7) Sync auth.users -> profiles
-- -----------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'buyer')
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  coalesce(u.raw_user_meta_data->>'role', 'buyer')
from auth.users u
on conflict (id) do update
set email = excluded.email;

-- -----------------------------
-- 8) Data migration
-- -----------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'name'
  ) then
    update public.products
    set title = coalesce(nullif(title, ''), name)
    where coalesce(title, '') = '';

    update public.products
    set name = coalesce(nullif(name, ''), title)
    where coalesce(name, '') = '';
  end if;
end $$;

do $$
begin
  if to_regclass('public.partners_requests') is not null then
    insert into public.sellers (user_id, store_name, bio, status, kyc_data, payout_profile)
    select
      pr.user_id,
      coalesce(pr.store_name, ''),
      coalesce(pr.description, ''),
      case when pr.status in ('approved', 'rejected', 'pending') then pr.status else 'pending' end,
      jsonb_build_object(
        'national_id', pr.national_id,
        'commercial_register', pr.commercial_register,
        'business_type', pr.business_type,
        'vat_number', pr.vat_number
      ),
      jsonb_build_object(
        'bank_name', pr.bank_name,
        'account_holder', pr.account_holder,
        'iban', pr.iban,
        'account_type', pr.account_type
      )
    from public.partners_requests pr
    where pr.user_id is not null
      and not exists (
        select 1 from public.sellers s where s.user_id = pr.user_id
      );
  end if;
end $$;

do $$
begin
  if to_regclass('public.my_products') is not null and to_regclass('public.products') is not null then
    insert into public.products (
      legacy_my_products_id,
      name,
      title,
      slug,
      price,
      price_after_discount,
      description,
      stock,
      image,
      category,
      status,
      currency,
      seller_id,
      attributes,
      shipping_info,
      created_at,
      updated_at
    )
    select
      mp.id::text,
      coalesce(nullif(mp.product_name, ''), 'Untitled Product'),
      coalesce(nullif(mp.product_name, ''), 'Untitled Product'),
      lower(regexp_replace(coalesce(nullif(mp.product_name, ''), 'product') || '-' || mp.id::text, '[^a-zA-Z0-9\-]+', '-', 'g')),
      coalesce(mp.price, 0),
      case
        when mp.discount_percent is null then coalesce(mp.price, 0)
        else greatest(coalesce(mp.price, 0) - (coalesce(mp.price, 0) * mp.discount_percent / 100.0), 0)
      end,
      coalesce(mp.description, ''),
      coalesce(mp.quantity, 0),
      mp.img1,
      mp.category,
      case
        when coalesce(mp.review_status, 'pending') = 'reviewed' then 'published'
        when coalesce(mp.review_status, 'pending') = 'pending' then 'pending_review'
        else 'draft'
      end,
      'EGP',
      s.id,
      '{}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    from public.my_products mp
    left join public.profiles p on lower(p.email) = lower(mp.email)
    left join public.sellers s on s.user_id = p.id
    where not exists (
      select 1
      from public.products pr
      where pr.legacy_my_products_id = mp.id::text
    );
  end if;
end $$;

-- -----------------------------
-- 9) updated_at triggers
-- -----------------------------
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_current_timestamp();

drop trigger if exists set_sellers_updated_at on public.sellers;
create trigger set_sellers_updated_at
before update on public.sellers
for each row execute function public.set_current_timestamp();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_current_timestamp();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_current_timestamp();

drop trigger if exists set_partners_requests_updated_at on public.partners_requests;
create trigger set_partners_requests_updated_at
before update on public.partners_requests
for each row execute function public.set_current_timestamp();

drop trigger if exists set_payouts_updated_at on public.payouts;
create trigger set_payouts_updated_at
before update on public.payouts
for each row execute function public.set_current_timestamp();

drop trigger if exists set_platform_settings_updated_at on public.platform_settings;
create trigger set_platform_settings_updated_at
before update on public.platform_settings
for each row execute function public.set_current_timestamp();

drop trigger if exists set_payment_transactions_updated_at on public.payment_transactions;
create trigger set_payment_transactions_updated_at
before update on public.payment_transactions
for each row execute function public.set_current_timestamp();

-- -----------------------------
-- 10) Storage bucket + policies
-- -----------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public;

drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read
on storage.objects for select
using (bucket_id = 'product-images');

drop policy if exists product_images_authenticated_upload on storage.objects;
create policy product_images_authenticated_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists product_images_owner_update on storage.objects;
create policy product_images_owner_update
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
)
with check (
  bucket_id = 'product-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

drop policy if exists product_images_owner_delete on storage.objects;
create policy product_images_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

-- -----------------------------
-- 11) RLS + policies
-- -----------------------------
alter table if exists public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select using (auth.uid() = id or public.is_admin());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
for insert with check (auth.uid() = id or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
for delete using (public.is_admin());

alter table if exists public.sellers enable row level security;
drop policy if exists sellers_select on public.sellers;
create policy sellers_select on public.sellers
for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists sellers_insert on public.sellers;
create policy sellers_insert on public.sellers
for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists sellers_update on public.sellers;
create policy sellers_update on public.sellers
for update using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());
drop policy if exists sellers_delete on public.sellers;
create policy sellers_delete on public.sellers
for delete using (public.is_admin());

alter table if exists public.products enable row level security;
drop policy if exists products_public_select_published on public.products;
create policy products_public_select_published on public.products
for select using (
  status = 'published'
  or public.is_admin()
  or exists (
    select 1 from public.sellers s
    where s.id = products.seller_id and s.user_id = auth.uid()
  )
);
drop policy if exists products_insert_owner_or_admin on public.products;
create policy products_insert_owner_or_admin on public.products
for insert with check (
  public.is_admin()
  or exists (
    select 1 from public.sellers s
    where s.id = products.seller_id
      and s.user_id = auth.uid()
      and s.status = 'approved'
  )
);
drop policy if exists products_update_owner_or_admin on public.products;
create policy products_update_owner_or_admin on public.products
for update using (
  public.is_admin()
  or exists (
    select 1 from public.sellers s
    where s.id = products.seller_id and s.user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.sellers s
    where s.id = products.seller_id and s.user_id = auth.uid()
  )
);
drop policy if exists products_delete_owner_or_admin on public.products;
create policy products_delete_owner_or_admin on public.products
for delete using (
  public.is_admin()
  or exists (
    select 1 from public.sellers s
    where s.id = products.seller_id and s.user_id = auth.uid()
  )
);

alter table if exists public.orders enable row level security;
drop policy if exists orders_select_owner_or_admin on public.orders;
create policy orders_select_owner_or_admin on public.orders
for select using (
  public.is_admin()
  or buyer_id = auth.uid()
  or exists (
    select 1 from public.sellers s
    where s.id = orders.seller_id and s.user_id = auth.uid()
  )
);
drop policy if exists orders_insert_buyer_or_admin on public.orders;
create policy orders_insert_buyer_or_admin on public.orders
for insert with check (
  public.is_admin()
  or buyer_id = auth.uid()
);
drop policy if exists orders_update_owner_or_admin on public.orders;
create policy orders_update_owner_or_admin on public.orders
for update using (
  public.is_admin()
  or exists (
    select 1 from public.sellers s
    where s.id = orders.seller_id and s.user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.sellers s
    where s.id = orders.seller_id and s.user_id = auth.uid()
  )
);
drop policy if exists orders_delete_admin_only on public.orders;
create policy orders_delete_admin_only on public.orders
for delete using (public.is_admin());

alter table if exists public.partners_requests enable row level security;
drop policy if exists partners_requests_select on public.partners_requests;
create policy partners_requests_select on public.partners_requests
for select using (public.is_admin() or user_id = auth.uid());
drop policy if exists partners_requests_insert on public.partners_requests;
create policy partners_requests_insert on public.partners_requests
for insert with check (public.is_admin() or user_id = auth.uid());
drop policy if exists partners_requests_update on public.partners_requests;
create policy partners_requests_update on public.partners_requests
for update using (public.is_admin() or user_id = auth.uid())
with check (public.is_admin() or user_id = auth.uid());
drop policy if exists partners_requests_delete on public.partners_requests;
create policy partners_requests_delete on public.partners_requests
for delete using (public.is_admin());

alter table if exists public.product_images enable row level security;
drop policy if exists product_images_select on public.product_images;
create policy product_images_select on public.product_images
for select using (
  public.is_admin()
  or exists (
    select 1
    from public.products p
    where p.id = product_images.product_id
      and (
        p.status = 'published'
        or exists (
          select 1 from public.sellers s
          where s.id = p.seller_id and s.user_id = auth.uid()
        )
      )
  )
);
drop policy if exists product_images_insert on public.product_images;
create policy product_images_insert on public.product_images
for insert with check (
  public.is_admin()
  or exists (
    select 1
    from public.products p
    join public.sellers s on s.id = p.seller_id
    where p.id = product_images.product_id
      and s.user_id = auth.uid()
  )
);
drop policy if exists product_images_update on public.product_images;
create policy product_images_update on public.product_images
for update using (
  public.is_admin()
  or exists (
    select 1
    from public.products p
    join public.sellers s on s.id = p.seller_id
    where p.id = product_images.product_id
      and s.user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.products p
    join public.sellers s on s.id = p.seller_id
    where p.id = product_images.product_id
      and s.user_id = auth.uid()
  )
);
drop policy if exists product_images_delete on public.product_images;
create policy product_images_delete on public.product_images
for delete using (
  public.is_admin()
  or exists (
    select 1
    from public.products p
    join public.sellers s on s.id = p.seller_id
    where p.id = product_images.product_id
      and s.user_id = auth.uid()
  )
);

alter table if exists public.order_items enable row level security;
drop policy if exists order_items_select on public.order_items;
create policy order_items_select on public.order_items
for select using (
  public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (
        o.buyer_id = auth.uid()
        or exists (
          select 1 from public.sellers s
          where s.id = o.seller_id and s.user_id = auth.uid()
        )
      )
  )
);
drop policy if exists order_items_write_admin on public.order_items;
create policy order_items_write_admin on public.order_items
for all using (public.is_admin()) with check (public.is_admin());

alter table if exists public.payouts enable row level security;
drop policy if exists payouts_select on public.payouts;
create policy payouts_select on public.payouts
for select using (
  public.is_admin()
  or exists (
    select 1 from public.sellers s
    where s.id = payouts.seller_id and s.user_id = auth.uid()
  )
);
drop policy if exists payouts_write_admin on public.payouts;
create policy payouts_write_admin on public.payouts
for all using (public.is_admin()) with check (public.is_admin());

alter table if exists public.reviews enable row level security;
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
for select using (true);
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews
for insert with check (auth.uid() = user_id);
drop policy if exists reviews_update on public.reviews;
create policy reviews_update on public.reviews
for update using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());
drop policy if exists reviews_delete on public.reviews;
create policy reviews_delete on public.reviews
for delete using (auth.uid() = user_id or public.is_admin());

alter table if exists public.payment_transactions enable row level security;
drop policy if exists payment_transactions_select_admin on public.payment_transactions;
create policy payment_transactions_select_admin on public.payment_transactions
for select using (public.is_admin());
drop policy if exists payment_transactions_write_admin on public.payment_transactions;
create policy payment_transactions_write_admin on public.payment_transactions
for all using (public.is_admin()) with check (public.is_admin());

alter table if exists public.platform_settings enable row level security;
drop policy if exists platform_settings_select_all on public.platform_settings;
create policy platform_settings_select_all on public.platform_settings
for select using (true);
drop policy if exists platform_settings_write_admin on public.platform_settings;
create policy platform_settings_write_admin on public.platform_settings
for all using (public.is_admin()) with check (public.is_admin());
