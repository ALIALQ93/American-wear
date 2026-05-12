-- دلو عام لصور أغلفة التصنيفات: الرفع من لوحة الإدارة (مسؤول نشط)، القراءة للجميع.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'category-images',
  'category-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- سياسات الكائنات (قد تكون موجودة عند إعادة التطبيق)
drop policy if exists "category_images_public_read" on storage.objects;
drop policy if exists "category_images_admin_insert" on storage.objects;
drop policy if exists "category_images_admin_update" on storage.objects;
drop policy if exists "category_images_admin_delete" on storage.objects;

create policy "category_images_public_read"
  on storage.objects for select
  using (bucket_id = 'category-images');

create policy "category_images_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'category-images'
    and public.is_active_admin()
  );

create policy "category_images_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'category-images' and public.is_active_admin())
  with check (bucket_id = 'category-images' and public.is_active_admin());

create policy "category_images_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'category-images' and public.is_active_admin());

commit;
