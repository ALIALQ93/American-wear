-- إدارة الزبائن (كلمة مرور قابلة للاسترجاع للإدارة) + محتوى الصفحة الرئيسية ووسائل التواصل
begin;

alter table public.store_customers
  add column if not exists password_plain text;

comment on column public.store_customers.password_plain is
  'نسخة كلمة المرور لاسترجاعها عبر الإدارة وواتساب — للمسؤول فقط، لا تُعرض للزبون.';

drop policy if exists "store_customers_admin_select" on public.store_customers;
drop policy if exists "store_customers_admin_update" on public.store_customers;

create policy "store_customers_admin_select" on public.store_customers
  for select to authenticated
  using ((select public.is_active_admin()));

create policy "store_customers_admin_update" on public.store_customers
  for update to authenticated
  using ((select public.is_active_admin()))
  with check ((select public.is_active_admin()));

insert into public.store_settings (key, value) values
  ('homepage_hero_title', 'تعريف الفخامة العصرية للأناقة العربية'),
  ('homepage_hero_subtitle', 'استكشف مجموعتنا الحصرية من الأزياء والملحقات الفاخرة التي تجسد التراث والابتكار'),
  ('homepage_hero_cta', 'تسوق الآن'),
  ('homepage_categories_title', 'التصنيفات الراقية'),
  ('homepage_new_arrivals_label', 'المجموعة الجديدة'),
  ('homepage_new_arrivals_title', 'إبداعات مختارة بعناية'),
  ('footer_tagline', 'وجهتكم الأولى للأناقة العالمية والرفاهية التي لا تضاهى في قلب العراق.'),
  ('contact_phone', ''),
  ('contact_phone_2', ''),
  ('whatsapp_number', ''),
  ('social_instagram', ''),
  ('social_facebook', ''),
  ('social_tiktok', ''),
  ('social_telegram', '')
on conflict (key) do nothing;

commit;
