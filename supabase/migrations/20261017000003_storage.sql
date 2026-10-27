-- Sunny Closet: product image storage bucket
-- The bucket is public: anyone can view images by their public URL; only the admin can upload, replace and delete.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'style-images',
  'style-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy style_images_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'style-images' and public.is_admin());

create policy style_images_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'style-images' and public.is_admin())
  with check (bucket_id = 'style-images' and public.is_admin());

create policy style_images_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'style-images' and public.is_admin());
