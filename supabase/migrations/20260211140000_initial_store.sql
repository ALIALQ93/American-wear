-- جداول متجر الإدارة (American wear) — تطبيق عبر: npx supabase db push
-- أو: psql "$DATABASE_URL" -f ...

begin;

-- المسؤولون: يُعرَّفون في Supabase Authentication؛ السماح بالدخول عبر ADMIN_ALLOWED_EMAILS في خادم Node

create table if not exists public.products (
  id bigint generated always as identity primary key,
  name_ar text not null,
  name_en text,
  category text,
  sku text,
  price_iqd bigint not null default 0,
  stock integer not null default 0,
  is_active smallint not null default 1,
  image_url text
);

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  order_ref text not null unique,
  customer_name text not null,
  customer_city text,
  summary text,
  total_iqd bigint not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.size_templates (
  id bigint generated always as identity primary key,
  category text not null,
  label text not null,
  is_active smallint not null default 1,
  sort_order integer not null default 0
);

-- منتجات وطلبات ومقاسات: تُضاف من لوحة الإدارة أو SQL يدوياً (قاعدة نظيفة)

commit;
