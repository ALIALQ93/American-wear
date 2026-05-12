-- صورة التصنيف (رابط عام) لعرضها في الرئيسية لاحقاً
begin;
alter table public.categories add column if not exists image_url text;
comment on column public.categories.image_url is 'رابط صورة غلاف التصنيف (HTTPS)، يُعرض في واجهة المتجر.';
commit;
