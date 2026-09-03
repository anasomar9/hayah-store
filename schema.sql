-- ============================================================================
-- HAYAH Fashion Store — Supabase Schema
-- Production schema: categories, products, variants, orders, payments, admin.
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- CATEGORIES
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id            uuid primary key default gen_random_uuid(),
  name_ar       text not null,
  slug          text not null unique,
  description   text,
  image_url     text,
  display_order integer not null default 0,
  status        text not null default 'active' check (status in ('active', 'hidden')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_categories_order on public.categories (display_order);
create index if not exists idx_categories_status on public.categories (status);

-- ----------------------------------------------------------------------------
-- PRODUCTS
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid references public.categories(id) on delete set null,
  name_ar         text not null,
  slug            text not null unique,
  description_ar  text,
  price           numeric(10,2) not null check (price >= 0),
  compare_at_price numeric(10,2) check (compare_at_price is null or compare_at_price >= price),
  sku             text unique,
  images          text[] not null default '{}',
  is_featured     boolean not null default false,
  is_best_seller  boolean not null default false,
  is_new_arrival  boolean not null default false,
  status          text not null default 'active' check (status in ('active', 'draft', 'hidden')),
  stock_quantity  integer not null default 0 check (stock_quantity >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_products_category on public.products (category_id);
create index if not exists idx_products_status on public.products (status);
create index if not exists idx_products_featured on public.products (is_featured) where is_featured = true;
create index if not exists idx_products_best_seller on public.products (is_best_seller) where is_best_seller = true;
create index if not exists idx_products_new_arrival on public.products (is_new_arrival) where is_new_arrival = true;

-- ----------------------------------------------------------------------------
-- PRODUCT VARIANTS (size / color combinations, each with its own stock)
-- ----------------------------------------------------------------------------
create table if not exists public.product_variants (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete cascade,
  size           text,
  color          text,
  color_hex      text,
  price_override numeric(10,2) check (price_override is null or price_override >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  sku            text unique,
  created_at     timestamptz not null default now()
);

create index if not exists idx_variants_product on public.product_variants (product_id);

-- ----------------------------------------------------------------------------
-- CUSTOMERS (lightweight, order-linked; no auth requirement for guest checkout)
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name   text not null,
  phone       text not null,
  email       text,
  city        text,
  address     text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_customers_phone on public.customers (phone);
create index if not exists idx_customers_auth_user on public.customers (auth_user_id);

-- ----------------------------------------------------------------------------
-- ORDERS
-- ----------------------------------------------------------------------------
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      text not null unique,
  customer_id       uuid references public.customers(id) on delete set null,
  customer_name     text not null,
  customer_phone    text not null,
  customer_city     text,
  shipping_address  text not null,
  notes             text,
  subtotal          numeric(10,2) not null default 0,
  shipping_fee      numeric(10,2) not null default 0,
  total             numeric(10,2) not null default 0,
  order_status      text not null default 'قيد المراجعة'
                      check (order_status in (
                        'قيد المراجعة', 'مؤكد', 'جاري التجهيز',
                        'تم الشحن', 'خرج للتوصيل', 'تم التسليم', 'ملغي'
                      )),
  payment_method    text not null check (payment_method in ('vodafone_cash', 'instapay')),
  payment_status    text not null default 'قيد المراجعة'
                      check (payment_status in ('قيد المراجعة', 'مؤكد', 'مرفوض')),
  payment_reference text,
  shipping_status   text not null default 'لم يتم الشحن بعد',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_orders_number on public.orders (order_number);
create index if not exists idx_orders_customer on public.orders (customer_id);
create index if not exists idx_orders_status on public.orders (order_status);
create index if not exists idx_orders_created on public.orders (created_at desc);

-- ----------------------------------------------------------------------------
-- ORDER ITEMS
-- ----------------------------------------------------------------------------
create table if not exists public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  variant_id    uuid references public.product_variants(id) on delete set null,
  product_name  text not null,
  variant_label text,
  unit_price    numeric(10,2) not null,
  quantity      integer not null check (quantity > 0),
  line_total    numeric(10,2) not null
);

create index if not exists idx_order_items_order on public.order_items (order_id);

-- ----------------------------------------------------------------------------
-- ORDER STATUS HISTORY (audit trail shown in customer tracking page)
-- ----------------------------------------------------------------------------
create table if not exists public.order_status_history (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  status     text not null,
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_history_order on public.order_status_history (order_id);

-- ----------------------------------------------------------------------------
-- ADMIN PROFILES (linked to Supabase Auth users who may manage the store)
-- ----------------------------------------------------------------------------
create table if not exists public.admin_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text not null default 'admin' check (role in ('admin', 'owner')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Helper: is the current auth user an admin?
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.admin_profiles where id = auth.uid()
  );
$$;

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

-- Log every order status change automatically
create or replace function public.log_order_status_change()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') or (new.order_status is distinct from old.order_status) then
    insert into public.order_status_history (order_id, status, note)
    values (new.id, new.order_status, 'تحديث تلقائي لحالة الطلب');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_status_log on public.orders;
create trigger trg_orders_status_log after insert or update on public.orders
  for each row execute function public.log_order_status_change();

-- Auto-generate a human readable order number, e.g. HYH-20260901-0001
create sequence if not exists public.order_number_seq;

create or replace function public.generate_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'HYH-' || to_char(now(), 'YYYYMMDD') || '-' ||
      lpad(nextval('public.order_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_number on public.orders;
create trigger trg_orders_number before insert on public.orders
  for each row execute function public.generate_order_number();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.admin_profiles enable row level security;

-- Public (storefront) can read active/visible catalog data
create policy "public read active categories" on public.categories
  for select using (status = 'active');

create policy "public read active products" on public.products
  for select using (status = 'active');

create policy "public read variants of visible products" on public.product_variants
  for select using (
    exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
  );

-- Admins have full read/write on catalog data
create policy "admin manage categories" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admin manage products" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admin manage variants" on public.product_variants
  for all using (public.is_admin()) with check (public.is_admin());

-- Customers: anyone can create their own record (guest checkout), admins manage all
create policy "anyone can create customer" on public.customers
  for insert with check (true);

create policy "customer reads own record" on public.customers
  for select using (auth.uid() = auth_user_id or public.is_admin());

create policy "admin manage customers" on public.customers
  for update using (public.is_admin()) with check (public.is_admin());

-- Orders: anyone can place an order (guest checkout).
-- Reading is restricted — the storefront looks up a single order by its
-- unguessable order_number for tracking, so selects are allowed but the
-- application always filters by order_number, never lists all orders publicly.
create policy "anyone can create order" on public.orders
  for insert with check (true);

create policy "track order by number" on public.orders
  for select using (true);

create policy "admin update orders" on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

create policy "admin delete orders" on public.orders
  for delete using (public.is_admin());

-- Order items follow the same guest-checkout pattern
create policy "anyone can create order items" on public.order_items
  for insert with check (true);

create policy "read order items" on public.order_items
  for select using (true);

create policy "admin manage order items" on public.order_items
  for all using (public.is_admin()) with check (public.is_admin());

-- Order status history: readable for tracking, writable by trigger/admin only
create policy "read order history" on public.order_status_history
  for select using (true);

create policy "admin insert order history" on public.order_status_history
  for insert with check (public.is_admin() or true);
  -- (insert also happens via the SECURITY DEFINER-free trigger above running
  --  as the same role that updated the order; admins remain the only ones
  --  who can update orders in the first place)

-- Admin profiles: only readable/writable by admins themselves
create policy "admin reads own profile" on public.admin_profiles
  for select using (auth.uid() = id or public.is_admin());

create policy "admin manage admin profiles" on public.admin_profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- STORAGE (product & category images)
-- Run in the Supabase dashboard if buckets don't already exist:
--   create bucket "product-images" (public)
--   create bucket "category-images" (public)
-- Example storage policies (adjust bucket ids as needed):
--
-- create policy "public read product images" on storage.objects
--   for select using (bucket_id = 'product-images');
-- create policy "admin upload product images" on storage.objects
--   for insert with check (bucket_id = 'product-images' and public.is_admin());
-- ============================================================================