-- Clinic media: logos, hero images, doctor photos and before/after cases.
--
-- Files live in a public Storage bucket so clinic websites can show them. Nobody writes
-- to the bucket directly: the Circle server checks the user's clinic permissions, validates
-- the file (type from its bytes, size) and uploads it with the service key under
-- "<clinic id>/…". Browsers never get Storage write access.

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('clinic-media', 'clinic-media', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update
      set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- Doctor photos may also be the demo images bundled with the app (/demo/…).
alter table public.doctors drop constraint if exists doctors_photo_url_check;
alter table public.doctors add constraint doctors_photo_url_check
  check (photo_url is null or photo_url ~ '^(https://|/demo/)[^\s"''<>]+$');
