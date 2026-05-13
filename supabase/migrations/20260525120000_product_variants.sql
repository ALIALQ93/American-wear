-- متغيرات المنتج: ألوان + مقاسات + مخزون (سعر موحّد على مستوى المنتج)
begin;

alter table public.products
  add column if not exists variant_mode text not null default 'none';

alter table public.products drop constraint if exists products_variant_mode_check;
alter table public.products add constraint products_variant_mode_check
  check (variant_mode in ('none', 'size_only', 'color_only', 'color_size'));

comment on column public.products.variant_mode is 'none | size_only | color_only | color_size — السعر من price_iqd للجميع.';

create table if not exists public.product_colors (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  name_ar text not null,
  name_en text,
  hex_code text,
  image_url text,
  sort_order integer not null default 0,
  is_active smallint not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_colors_product on public.product_colors (product_id);

create table if not exists public.product_variants (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,
  color_id bigint references public.product_colors (id) on delete cascade,
  size_label text,
  sku text,
  stock integer not null default 0,
  is_active smallint not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_variants_product on public.product_variants (product_id);
create index if not exists idx_product_variants_color on public.product_variants (color_id);

create unique index if not exists product_variants_unique_combo
  on public.product_variants (product_id, coalesce(color_id, -1), coalesce(size_label, ''));

comment on table public.product_colors is 'ألوان المنتج — صورة واحدة لكل لون.';
comment on table public.product_variants is 'مخزون قابل للبيع: لون × مقاس (أو أحدهما أو لا شيء).';

-- ترحيل المنتجات الحالية: متغير واحد يحمل المخزون الحالي
insert into public.product_variants (product_id, color_id, size_label, sku, stock, is_active)
select p.id, null, null, p.sku, p.stock, p.is_active
from public.products p
where not exists (
  select 1 from public.product_variants v where v.product_id = p.id
);

-- RLS
alter table public.product_colors enable row level security;
alter table public.product_variants enable row level security;

drop policy if exists "product_colors_select" on public.product_colors;
drop policy if exists "product_colors_write_admin" on public.product_colors;
drop policy if exists "product_colors_insert_admin" on public.product_colors;
drop policy if exists "product_colors_update_admin" on public.product_colors;
drop policy if exists "product_colors_delete_admin" on public.product_colors;

create policy "product_colors_select" on public.product_colors
  for select to anon, authenticated
  using (
    is_active = 1
    or exists (
      select 1 from public.products pr
      where pr.id = product_id and (select public.is_active_admin())
    )
  );

create policy "product_colors_insert_admin" on public.product_colors
  for insert to authenticated
  with check ((select public.is_active_admin()));

create policy "product_colors_update_admin" on public.product_colors
  for update to authenticated
  using ((select public.is_active_admin()))
  with check ((select public.is_active_admin()));

create policy "product_colors_delete_admin" on public.product_colors
  for delete to authenticated
  using ((select public.is_active_admin()));

drop policy if exists "product_variants_select" on public.product_variants;
drop policy if exists "product_variants_insert_admin" on public.product_variants;
drop policy if exists "product_variants_update_admin" on public.product_variants;
drop policy if exists "product_variants_delete_admin" on public.product_variants;

create policy "product_variants_select" on public.product_variants
  for select to anon, authenticated
  using (
    is_active = 1
    or (select public.is_active_admin())
  );

create policy "product_variants_insert_admin" on public.product_variants
  for insert to authenticated
  with check ((select public.is_active_admin()));

create policy "product_variants_update_admin" on public.product_variants
  for update to authenticated
  using ((select public.is_active_admin()))
  with check ((select public.is_active_admin()));

create policy "product_variants_delete_admin" on public.product_variants
  for delete to authenticated
  using ((select public.is_active_admin()));

commit;
