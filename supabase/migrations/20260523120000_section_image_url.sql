-- صورة غلاف القسم الفرعي (واجهة المتجر + الإدارة)
begin;

alter table public.category_sections add column if not exists image_url text;

comment on column public.category_sections.image_url is 'رابط صورة تمثّل القسم (HTTPS)، يُعرض في صفحة التصنيف وصفحة القسم.';

commit;
