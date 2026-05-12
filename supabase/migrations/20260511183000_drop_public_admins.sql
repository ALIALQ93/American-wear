-- إزالة جدول المسؤولين المحلي: المصادقة عبر Supabase Authentication + ADMIN_ALLOWED_EMAILS على الخادم
begin;

drop table if exists public.admins;

commit;
