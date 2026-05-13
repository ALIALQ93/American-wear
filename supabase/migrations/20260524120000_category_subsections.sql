-- تصنيف فرعي داخل القسم (مثال: ملابس → رجالي → رسمي / رياضي) — يُربَط بالمنتج عبر subsection_id
begin;

create table if not exists public.category_subsections (
  id bigint generated always as identity primary key,
  section_id bigint not null references public.category_sections (id) on delete cascade,
  name_ar text not null,
  name_en text,
  slug text not null,
  sort_order integer not null default 0,
  is_active smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, slug)
);

create index if not exists idx_category_subsections_section on public.category_subsections (section_id);

alter table public.products add column if not exists subsection_id bigint references public.category_subsections (id) on delete set null;

create index if not exists idx_products_subsection on public.products (subsection_id);

comment on table public.category_subsections is 'تصنيف فرعي تابع لقسم (خط/نوع: رسمي، رياضي، …) — يُختار على مستوى المنتج.';
comment on column public.products.subsection_id is 'تصنيف فرعي اختياري ضمن القسم المختار للمنتج.';

-- RLS
alter table public.category_subsections enable row level security;

drop policy if exists "subsections_select" on public.category_subsections;
drop policy if exists "subsections_insert_admin" on public.category_subsections;
drop policy if exists "subsections_update_admin" on public.category_subsections;
drop policy if exists "subsections_delete_admin" on public.category_subsections;

create policy "subsections_select" on public.category_subsections
  for select to anon, authenticated
  using (is_active = 1 or (select public.is_active_admin()));

create policy "subsections_insert_admin" on public.category_subsections
  for insert to authenticated
  with check ((select public.is_active_admin()));

create policy "subsections_update_admin" on public.category_subsections
  for update to authenticated
  using ((select public.is_active_admin()))
  with check ((select public.is_active_admin()));

create policy "subsections_delete_admin" on public.category_subsections
  for delete to authenticated
  using ((select public.is_active_admin()));

commit;
