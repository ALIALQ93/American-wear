-- لوحة ألوان جاهزة للاختيار السريع عند المنتج (مع ربط المقاسات عبر product_variants)
begin;

create table if not exists public.color_presets (
  id bigint generated always as identity primary key,
  name_ar text not null,
  name_en text,
  hex_code text not null,
  sort_order integer not null default 0,
  is_active smallint not null default 1,
  unique (name_ar)
);

comment on table public.color_presets is 'ألوان معرّفة مسبقاً — يختارها المسؤول للمنتج بدل الإدخال اليدوي.';

alter table public.product_colors
  add column if not exists preset_id bigint references public.color_presets (id) on delete set null;

create index if not exists idx_product_colors_preset on public.product_colors (preset_id);

insert into public.color_presets (name_ar, name_en, hex_code, sort_order) values
  ('أسود', 'Black', '#1a1a1a', 1),
  ('أبيض', 'White', '#f5f5f5', 2),
  ('كحلي', 'Navy', '#1e3a5f', 3),
  ('رمادي', 'Grey', '#6b7280', 4),
  ('بيج', 'Beige', '#d4c4a8', 5),
  ('بني', 'Brown', '#5c4033', 6),
  ('أزرق', 'Blue', '#2563eb', 7),
  ('أحمر', 'Red', '#b91c1c', 8),
  ('أخضر', 'Green', '#166534', 9),
  ('ذهبي', 'Gold', '#c9a227', 10),
  ('فضي', 'Silver', '#c0c0c0', 11),
  ('وردي', 'Pink', '#db2777', 12),
  ('بنفسجي', 'Purple', '#7c3aed', 13),
  ('كريمي', 'Cream', '#fff8e7', 14),
  ('زيتي', 'Olive', '#556b2f', 15),
  ('برتقالي', 'Orange', '#ea580c', 16)
on conflict (name_ar) do nothing;

alter table public.color_presets enable row level security;

drop policy if exists "color_presets_select" on public.color_presets;
drop policy if exists "color_presets_insert_admin" on public.color_presets;
drop policy if exists "color_presets_update_admin" on public.color_presets;
drop policy if exists "color_presets_delete_admin" on public.color_presets;

create policy "color_presets_select" on public.color_presets
  for select to anon, authenticated
  using (is_active = 1 or (select public.is_active_admin()));

create policy "color_presets_insert_admin" on public.color_presets
  for insert to authenticated with check ((select public.is_active_admin()));

create policy "color_presets_update_admin" on public.color_presets
  for update to authenticated
  using ((select public.is_active_admin())) with check ((select public.is_active_admin()));

create policy "color_presets_delete_admin" on public.color_presets
  for delete to authenticated using ((select public.is_active_admin()));

commit;
