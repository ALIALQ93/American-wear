-- تصنيفات رئيسية + أقسام فرعية (مثال: ساعات ← رجالي / نسائي)
-- الهيكل من الهجرة؛ المحتوى يُدار من لوحة الإدارة (إضافة، تعديل، تفعيل/إخفاء، ترتيب، وحذف عند عدم وجود منتجات مرتبطة)

begin;

create table if not exists public.categories (
  id bigint generated always as identity primary key,
  name_ar text not null,
  name_en text,
  slug text not null unique,
  description_ar text,
  sort_order integer not null default 0,
  is_active smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.category_sections (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.categories (id) on delete cascade,
  name_ar text not null,
  name_en text,
  slug text not null,
  sort_order integer not null default 0,
  is_active smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);

create index if not exists idx_category_sections_category on public.category_sections (category_id);

alter table public.products add column if not exists category_id bigint references public.categories (id);
alter table public.products add column if not exists section_id bigint references public.category_sections (id);

create index if not exists idx_products_category on public.products (category_id);
create index if not exists idx_products_section on public.products (section_id);

-- التصنيفات والأقسام: تُدار من لوحة الإدارة (صفحة التصنيفات)

commit;
