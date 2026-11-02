-- Jalankan di Supabase -> SQL Editor (sekali aja, setelah schema.sql).
-- Tambah token per user buat Authorization: Bearer di home.php dan profile.php.

alter table public.users add column if not exists token text unique;

-- Token user tes, sama kayak di dokumen API.
update public.users
set token = 'basdgicascsafssfacodsde123'
where email = 'test@user.com';

-- User lain yang belum punya token dapat token acak.
update public.users
set token = encode(extensions.gen_random_bytes(16), 'hex')
where token is null;

alter table public.users alter column token set not null;
