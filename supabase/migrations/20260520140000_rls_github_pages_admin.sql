-- RLS: واجهة الإدارة من المتصفح (GitHub Pages) عبر Supabase فقط — بدون Express.
-- بعد التطبيق: نفّذ من جذر المشروع: npm run db:push
-- ملاحظة: ADMIN_ALLOWED_EMAILS يعمل فقط على خادم Node؛ على Pages يلزم صف في admin_profiles.

begin;

-- دوال مساعدة (تقرأ admin_profiles بصلاحية definer لتجنب تعارض RLS)
create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles p
    where p.user_id = auth.uid() and p.is_active = true
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles p
    where p.user_id = auth.uid() and p.is_active = true and p.role = 'super_admin'
  );
$$;

revoke all on function public.is_active_admin() from public;
revoke all on function public.is_super_admin() from public;
grant execute on function public.is_active_admin() to anon, authenticated;
grant execute on function public.is_super_admin() to anon, authenticated;

-- قواعد الإدراج: أول صف يجب أن يكون super_admin + تعبئة البريد من auth.users عند الحاجة
create or replace function public.admin_profiles_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n int;
  ae text;
begin
  select count(*)::int into n from public.admin_profiles where role = 'super_admin' and is_active;
  if n = 0 and new.role is distinct from 'super_admin' then
    raise exception 'FIRST_MUST_BE_SUPER_ADMIN';
  end if;
  if new.email is null or btrim(new.email) = '' then
    select lower(trim(u.email::text)) into ae from auth.users u where u.id = new.user_id;
    if ae is null then
      raise exception 'AUTH_USER_NOT_FOUND';
    end if;
    new.email := ae;
  else
    new.email := lower(btrim(new.email));
  end if;
  return new;
end;
$$;

drop trigger if exists admin_profiles_before_insert on public.admin_profiles;
create trigger admin_profiles_before_insert
  before insert on public.admin_profiles
  for each row execute function public.admin_profiles_before_insert();

-- يمنع ترك الجدول بلا super_admin نشط
create or replace function public.admin_profiles_after_stmt_super_guard()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.admin_profiles where role = 'super_admin' and is_active) < 1 then
    raise exception 'LAST_SUPER_ADMIN';
  end if;
  return null;
end;
$$;

drop trigger if exists admin_profiles_super_guard_stmt on public.admin_profiles;
create trigger admin_profiles_super_guard_stmt
  after insert or update or delete on public.admin_profiles
  for each statement execute function public.admin_profiles_after_stmt_super_guard();

-- إحصائيات لوحة التحكم (تجميعات دون تنزيل كل الصفوف)
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_admin() then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'totalOrders', (select count(*)::int from public.orders),
    'revenueIQD', (select coalesce(sum(total_iqd), 0)::bigint from public.orders where status is distinct from 'cancelled'),
    'products', (select count(*)::int from public.products),
    'newCustomers', (select count(distinct customer_name)::int from public.orders)
  );
end;
$$;

revoke all on function public.admin_dashboard_stats() from public;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- تفعيل RLS
alter table public.admin_profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.size_templates enable row level security;
alter table public.categories enable row level security;
alter table public.category_sections enable row level security;

-- إزالة سياسات قديمة بنفس الأسماء (إن أعدت تشغيل الهجرة يدوياً)
drop policy if exists "admin_profiles_select" on public.admin_profiles;
drop policy if exists "admin_profiles_insert" on public.admin_profiles;
drop policy if exists "admin_profiles_update" on public.admin_profiles;
drop policy if exists "admin_profiles_delete" on public.admin_profiles;

create policy "admin_profiles_select" on public.admin_profiles
  for select to authenticated
  using ((select public.is_super_admin()) or (user_id = auth.uid()));

create policy "admin_profiles_insert" on public.admin_profiles
  for insert to authenticated
  with check ((select public.is_super_admin()));

create policy "admin_profiles_update" on public.admin_profiles
  for update to authenticated
  using ((select public.is_super_admin()))
  with check ((select public.is_super_admin()));

create policy "admin_profiles_delete" on public.admin_profiles
  for delete to authenticated
  using ((select public.is_super_admin()) and (user_id <> auth.uid()));

-- منتجات: قراءة عامة للمعروض النشط؛ الكتابة للمسؤولين فقط
drop policy if exists "products_select_public_active" on public.products;
drop policy if exists "products_all_admin" on public.products;

create policy "products_select_public_active" on public.products
  for select to anon, authenticated
  using (is_active = 1 or (select public.is_active_admin()));

create policy "products_insert_admin" on public.products
  for insert to authenticated
  with check ((select public.is_active_admin()));

create policy "products_update_admin" on public.products
  for update to authenticated
  using ((select public.is_active_admin()))
  with check ((select public.is_active_admin()));

create policy "products_delete_admin" on public.products
  for delete to authenticated
  using ((select public.is_active_admin()));

-- طلبات: المسؤولون فقط
drop policy if exists "orders_all_admin" on public.orders;

create policy "orders_select_admin" on public.orders
  for select to authenticated
  using ((select public.is_active_admin()));

create policy "orders_insert_admin" on public.orders
  for insert to authenticated
  with check ((select public.is_active_admin()));

create policy "orders_update_admin" on public.orders
  for update to authenticated
  using ((select public.is_active_admin()))
  with check ((select public.is_active_admin()));

create policy "orders_delete_admin" on public.orders
  for delete to authenticated
  using ((select public.is_active_admin()));

-- قوالب المقاسات
drop policy if exists "sizes_select" on public.size_templates;
drop policy if exists "sizes_write_admin" on public.size_templates;

create policy "sizes_select" on public.size_templates
  for select to anon, authenticated
  using (is_active = 1 or (select public.is_active_admin()));

create policy "sizes_insert_admin" on public.size_templates
  for insert to authenticated
  with check ((select public.is_active_admin()));

create policy "sizes_update_admin" on public.size_templates
  for update to authenticated
  using ((select public.is_active_admin()))
  with check ((select public.is_active_admin()));

create policy "sizes_delete_admin" on public.size_templates
  for delete to authenticated
  using ((select public.is_active_admin()));

-- تصنيفات
drop policy if exists "categories_select" on public.categories;
drop policy if exists "categories_write_admin" on public.categories;

create policy "categories_select" on public.categories
  for select to anon, authenticated
  using (is_active = 1 or (select public.is_active_admin()));

create policy "categories_insert_admin" on public.categories
  for insert to authenticated
  with check ((select public.is_active_admin()));

create policy "categories_update_admin" on public.categories
  for update to authenticated
  using ((select public.is_active_admin()))
  with check ((select public.is_active_admin()));

create policy "categories_delete_admin" on public.categories
  for delete to authenticated
  using ((select public.is_active_admin()));

-- أقسام فرعية
drop policy if exists "sections_select" on public.category_sections;
drop policy if exists "sections_write_admin" on public.category_sections;

create policy "sections_select" on public.category_sections
  for select to anon, authenticated
  using (is_active = 1 or (select public.is_active_admin()));

create policy "sections_insert_admin" on public.category_sections
  for insert to authenticated
  with check ((select public.is_active_admin()));

create policy "sections_update_admin" on public.category_sections
  for update to authenticated
  using ((select public.is_active_admin()))
  with check ((select public.is_active_admin()));

create policy "sections_delete_admin" on public.category_sections
  for delete to authenticated
  using ((select public.is_active_admin()));

commit;
