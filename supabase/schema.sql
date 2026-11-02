-- Jalankan di Supabase -> SQL Editor

create table if not exists public.users (
  id bigint generated always as identity primary key,
  email text not null unique,
  password_hash text not null,
  name text,
  address text,
  profil text,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now()
);

-- RLS on tanpa policy: tabel tertutup dari public key.
-- API pakai service role key, jadi tetap bisa baca.
alter table public.users enable row level security;

-- User tes, sama kayak di Postman. Password di-hash bcrypt.
insert into public.users (email, password_hash, name, address, profil, token)
values (
  'test@user.com',
  extensions.crypt('1233', extensions.gen_salt('bf')),
  'Bagicode',
  'Depok',
  'https://avatars.githubusercontent.com/u/8241782?v=4',
  'basdgicascsafssfacodsde123'
)
on conflict (email) do nothing;
