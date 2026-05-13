-- أجور الشحن للمحافظات + مجموعات مقاسات جاهزة
begin;

create table if not exists public.shipping_governorates (
  id bigint generated always as identity primary key,
  name_ar text not null,
  name_en text,
  slug text not null,
  fee_iqd bigint not null default 0,
  is_major smallint not null default 0,
  sort_order integer not null default 0,
  is_active smallint not null default 1,
  unique (slug)
);

comment on table public.shipping_governorates is 'أجور الشحن حسب المحافظة (د.ع).';

create table if not exists public.size_sets (
  id bigint generated always as identity primary key,
  name_ar text not null,
  name_en text,
  slug text not null,
  sort_order integer not null default 0,
  is_active smallint not null default 1,
  unique (slug)
);

create table if not exists public.size_set_items (
  id bigint generated always as identity primary key,
  set_id bigint not null references public.size_sets (id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  unique (set_id, label)
);

create index if not exists idx_size_set_items_set on public.size_set_items (set_id);

alter table public.products
  add column if not exists size_set_id bigint references public.size_sets (id) on delete set null;

create index if not exists idx_products_size_set on public.products (size_set_id);

comment on table public.size_sets is 'مجموعات مقاسات جاهزة يختارها المسؤول عند المنتج.';
comment on column public.products.size_set_id is 'مجموعة المقاسات المستخدمة عند variant_mode يتضمن مقاسات.';

-- محافظات العراق (المدن المهمة مُعلَّمة is_major)
insert into public.shipping_governorates (name_ar, name_en, slug, fee_iqd, is_major, sort_order) values
  ('بغداد', 'Baghdad', 'baghdad', 5000, 1, 1),
  ('البصرة', 'Basra', 'basra', 7000, 1, 2),
  ('نينوى', 'Nineveh', 'nineveh', 7000, 1, 3),
  ('أربيل', 'Erbil', 'erbil', 7000, 1, 4),
  ('السليمانية', 'Sulaymaniyah', 'sulaymaniyah', 7500, 1, 5),
  ('كركوك', 'Kirkuk', 'kirkuk', 7500, 1, 6),
  ('النجف', 'Najaf', 'najaf', 6500, 1, 7),
  ('كربلاء', 'Karbala', 'karbala', 6500, 1, 8),
  ('دهوك', 'Duhok', 'duhok', 8000, 0, 9),
  ('بابل', 'Babil', 'babil', 7000, 0, 10),
  ('ديالى', 'Diyala', 'diyala', 8000, 0, 11),
  ('الأنبار', 'Anbar', 'anbar', 9000, 0, 12),
  ('واسط', 'Wasit', 'wasit', 8000, 0, 13),
  ('ميسان', 'Maysan', 'maysan', 8500, 0, 14),
  ('ذي قار', 'Dhi Qar', 'dhi-qar', 8500, 0, 15),
  ('المثنى', 'Muthanna', 'muthanna', 9500, 0, 16),
  ('القادسية', 'Qadisiyyah', 'qadisiyyah', 7500, 0, 17),
  ('صلاح الدين', 'Saladin', 'saladin', 8000, 0, 18)
on conflict (slug) do nothing;

-- مجموعات مقاسات جاهزة
insert into public.size_sets (name_ar, name_en, slug, sort_order) values
  ('ملابس (حروف)', 'Clothing (alpha)', 'clothing-alpha', 1),
  ('أحذية (مقاس أوروبي)', 'Shoes (EU)', 'shoes-eu', 2),
  ('بناطيل (خصر)', 'Pants (waist)', 'pants-waist', 3),
  ('مقاس موحّد', 'One size', 'one-size', 4),
  ('أطفال (سنوات)', 'Kids (years)', 'kids-years', 5)
on conflict (slug) do nothing;

insert into public.size_set_items (set_id, label, sort_order)
select s.id, v.label, v.ord
from public.size_sets s
cross join lateral (
  values
    ('clothing-alpha', 'XS', 1), ('clothing-alpha', 'S', 2), ('clothing-alpha', 'M', 3),
    ('clothing-alpha', 'L', 4), ('clothing-alpha', 'XL', 5), ('clothing-alpha', 'XXL', 6),
    ('clothing-alpha', '3XL', 7)
) as v(set_slug, label, ord)
where s.slug = v.set_slug
on conflict (set_id, label) do nothing;

insert into public.size_set_items (set_id, label, sort_order)
select s.id, v.label, v.ord
from public.size_sets s
cross join lateral (
  values
    ('shoes-eu', '39', 1), ('shoes-eu', '40', 2), ('shoes-eu', '41', 3), ('shoes-eu', '42', 4),
    ('shoes-eu', '43', 5), ('shoes-eu', '44', 6), ('shoes-eu', '45', 7), ('shoes-eu', '46', 8)
) as v(set_slug, label, ord)
where s.slug = v.set_slug
on conflict (set_id, label) do nothing;

insert into public.size_set_items (set_id, label, sort_order)
select s.id, v.label, v.ord
from public.size_sets s
cross join lateral (
  values
    ('pants-waist', '28', 1), ('pants-waist', '30', 2), ('pants-waist', '32', 3),
    ('pants-waist', '34', 4), ('pants-waist', '36', 5), ('pants-waist', '38', 6), ('pants-waist', '40', 7)
) as v(set_slug, label, ord)
where s.slug = v.set_slug
on conflict (set_id, label) do nothing;

insert into public.size_set_items (set_id, label, sort_order)
select s.id, 'واحد', 1 from public.size_sets s where s.slug = 'one-size'
on conflict (set_id, label) do nothing;

insert into public.size_set_items (set_id, label, sort_order)
select s.id, v.label, v.ord
from public.size_sets s
cross join lateral (
  values
    ('kids-years', '2Y', 1), ('kids-years', '4Y', 2), ('kids-years', '6Y', 3),
    ('kids-years', '8Y', 4), ('kids-years', '10Y', 5), ('kids-years', '12Y', 6)
) as v(set_slug, label, ord)
where s.slug = v.set_slug
on conflict (set_id, label) do nothing;

-- RLS
alter table public.shipping_governorates enable row level security;
alter table public.size_sets enable row level security;
alter table public.size_set_items enable row level security;

drop policy if exists "shipping_select" on public.shipping_governorates;
drop policy if exists "shipping_insert_admin" on public.shipping_governorates;
drop policy if exists "shipping_update_admin" on public.shipping_governorates;
drop policy if exists "shipping_delete_admin" on public.shipping_governorates;

create policy "shipping_select" on public.shipping_governorates
  for select to anon, authenticated
  using (is_active = 1 or (select public.is_active_admin()));

create policy "shipping_insert_admin" on public.shipping_governorates
  for insert to authenticated with check ((select public.is_active_admin()));

create policy "shipping_update_admin" on public.shipping_governorates
  for update to authenticated
  using ((select public.is_active_admin())) with check ((select public.is_active_admin()));

create policy "shipping_delete_admin" on public.shipping_governorates
  for delete to authenticated using ((select public.is_active_admin()));

drop policy if exists "size_sets_select" on public.size_sets;
drop policy if exists "size_sets_insert_admin" on public.size_sets;
drop policy if exists "size_sets_update_admin" on public.size_sets;
drop policy if exists "size_sets_delete_admin" on public.size_sets;

create policy "size_sets_select" on public.size_sets
  for select to anon, authenticated
  using (is_active = 1 or (select public.is_active_admin()));

create policy "size_sets_insert_admin" on public.size_sets
  for insert to authenticated with check ((select public.is_active_admin()));

create policy "size_sets_update_admin" on public.size_sets
  for update to authenticated
  using ((select public.is_active_admin())) with check ((select public.is_active_admin()));

create policy "size_sets_delete_admin" on public.size_sets
  for delete to authenticated using ((select public.is_active_admin()));

drop policy if exists "size_set_items_select" on public.size_set_items;
drop policy if exists "size_set_items_insert_admin" on public.size_set_items;
drop policy if exists "size_set_items_update_admin" on public.size_set_items;
drop policy if exists "size_set_items_delete_admin" on public.size_set_items;

create policy "size_set_items_select" on public.size_set_items
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.size_sets ss
      where ss.id = set_id and (ss.is_active = 1 or (select public.is_active_admin()))
    )
  );

create policy "size_set_items_insert_admin" on public.size_set_items
  for insert to authenticated with check ((select public.is_active_admin()));

create policy "size_set_items_update_admin" on public.size_set_items
  for update to authenticated
  using ((select public.is_active_admin())) with check ((select public.is_active_admin()));

create policy "size_set_items_delete_admin" on public.size_set_items
  for delete to authenticated using ((select public.is_active_admin()));

commit;
