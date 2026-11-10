-- Jalankan di Supabase -> SQL Editor (sekali aja, setelah 002_token.sql).
-- Isi: produk, wishlist, cart, checkout, order. Aman dijalankan ulang.

-- ============ KATALOG ============

create table if not exists public.categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  image text
);

create table if not exists public.products (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.categories (id),
  slug text not null unique,
  name text not null,
  brand text not null,
  description text not null default '',
  price integer not null check (price >= 0),          -- harga sekarang (Rupiah)
  old_price integer check (old_price > price),        -- harga coret, null kalau gak diskon
  rating numeric(2, 1) not null default 0,
  review_count integer not null default 0,
  stock integer not null default 0 check (stock >= 0),
  colors text[] not null default '{}',
  sizes text[] not null default '{}',
  images text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category_id);

-- ============ WISHLIST & CART ============

create table if not exists public.wishlists (
  user_id bigint not null references public.users (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.cart_items (
  id bigint generated always as identity primary key,
  user_id bigint not null references public.users (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete cascade,
  qty integer not null check (qty between 1 and 99),
  color text not null default '',
  size text not null default '',
  created_at timestamptz not null default now(),
  -- produk sama + warna sama + ukuran sama = satu baris, qty yang nambah
  unique (user_id, product_id, color, size)
);

-- ============ CHECKOUT ============

create table if not exists public.delivery_options (
  code text primary key,
  name text not null,
  fee integer not null,
  eta text not null
);

create table if not exists public.payment_methods (
  code text primary key,
  name text not null
);

create table if not exists public.vouchers (
  code text primary key,                               -- selalu huruf besar
  type text not null check (type in ('percent', 'fixed')),
  value integer not null check (value > 0),            -- persen atau Rupiah
  max_discount integer,                                -- batas potongan buat tipe percent
  min_spend integer not null default 0,
  active boolean not null default true
);

-- ============ ORDER ============

create table if not exists public.orders (
  id bigint generated always as identity primary key,
  code text unique,
  user_id bigint not null references public.users (id) on delete cascade,
  status text not null default 'ordered'
    check (status in ('ordered', 'packed', 'shipped', 'delivered', 'cancelled')),
  address text not null,
  delivery text not null references public.delivery_options (code),
  delivery_fee integer not null,
  payment_method text not null references public.payment_methods (code),
  voucher_code text,
  subtotal integer not null,
  discount integer not null default 0,
  total integer not null,
  created_at timestamptz not null default now()
);

create index if not exists orders_user_idx on public.orders (user_id, created_at desc);

-- Snapshot nama & harga saat beli. Harga produk boleh berubah, order lama tetap.
create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id) on delete cascade,
  product_id bigint references public.products (id) on delete set null,
  name text not null,
  image text,
  price integer not null,
  qty integer not null,
  color text not null default '',
  size text not null default ''
);

-- Riwayat status buat layar Track Order.
create table if not exists public.order_tracking (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders (id) on delete cascade,
  status text not null,
  note text not null,
  created_at timestamptz not null default now()
);

-- RLS on tanpa policy: semua tabel tertutup dari public key, API pakai service role.
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.wishlists enable row level security;
alter table public.cart_items enable row level security;
alter table public.delivery_options enable row level security;
alter table public.payment_methods enable row level security;
alter table public.vouchers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_tracking enable row level security;

-- ============ FUNCTION ============

-- Checkout: cart -> order dalam satu transaksi. Gagal di tengah = semua batal.
-- Error dikirim pakai kode, API ubah jadi pesan.
create or replace function public.create_order(
  p_user_id bigint,
  p_address text,
  p_delivery text,
  p_payment text,
  p_voucher text default null
) returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_fee integer;
  v_subtotal integer;
  v_discount integer := 0;
  v_voucher vouchers%rowtype;
  v_short text;
  v_order bigint;
begin
  select fee into v_fee from delivery_options where code = p_delivery;
  if not found then raise exception 'BAD_DELIVERY'; end if;

  perform 1 from payment_methods where code = p_payment;
  if not found then raise exception 'BAD_PAYMENT'; end if;

  if coalesce(trim(p_address), '') = '' then raise exception 'NO_ADDRESS'; end if;

  -- Kunci baris produk biar dua checkout barengan gak bikin stok minus.
  perform 1 from products p
  where p.id in (select product_id from cart_items where user_id = p_user_id)
  for update;

  select coalesce(sum(p.price * c.qty), 0) into v_subtotal
  from cart_items c join products p on p.id = c.product_id
  where c.user_id = p_user_id;

  if v_subtotal = 0 then raise exception 'CART_EMPTY'; end if;

  select p.name into v_short
  from cart_items c join products p on p.id = c.product_id
  where c.user_id = p_user_id
  group by p.id, p.name, p.stock
  having sum(c.qty) > p.stock
  limit 1;

  if v_short is not null then raise exception 'OUT_OF_STOCK:%', v_short; end if;

  if coalesce(trim(p_voucher), '') <> '' then
    select * into v_voucher from vouchers where code = upper(trim(p_voucher)) and active;
    if not found then raise exception 'BAD_VOUCHER'; end if;
    if v_subtotal < v_voucher.min_spend then
      raise exception 'VOUCHER_MIN_SPEND:%', v_voucher.min_spend;
    end if;
    v_discount := case v_voucher.type
      when 'percent' then least((v_subtotal::bigint * v_voucher.value / 100)::integer,
                                coalesce(v_voucher.max_discount, v_subtotal))
      else least(v_voucher.value, v_subtotal)
    end;
  end if;

  insert into orders (user_id, address, delivery, delivery_fee, payment_method,
                      voucher_code, subtotal, discount, total)
  values (p_user_id, trim(p_address), p_delivery, v_fee, p_payment,
          v_voucher.code, v_subtotal, v_discount, v_subtotal - v_discount + v_fee)
  returning id into v_order;

  update orders set code = 'OD-' || to_char(now(), 'YYMMDD') || '-' || v_order
  where id = v_order;

  insert into order_items (order_id, product_id, name, image, price, qty, color, size)
  select v_order, p.id, p.name, p.images[1], p.price, c.qty, c.color, c.size
  from cart_items c join products p on p.id = c.product_id
  where c.user_id = p_user_id
  order by c.id;

  update products p set stock = p.stock - s.qty
  from (select product_id, sum(qty) as qty from cart_items
        where user_id = p_user_id group by product_id) s
  where p.id = s.product_id;

  insert into order_tracking (order_id, status, note)
  values (v_order, 'ordered', 'Pesanan dibuat');

  delete from cart_items where user_id = p_user_id;

  return v_order;
end;
$$;

-- Ubah status order.
-- 'next'   : ordered -> packed -> shipped -> delivered (simulasi kurir buat belajar)
-- 'cancel' : cuma boleh saat 'ordered', stok balik lagi
create or replace function public.update_order_status(
  p_user_id bigint,
  p_order_id bigint,
  p_action text
) returns text
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_next text;
  v_note text;
begin
  select status into v_status from orders
  where id = p_order_id and user_id = p_user_id
  for update;

  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if p_action = 'cancel' then
    if v_status <> 'ordered' then raise exception 'CANNOT_CANCEL'; end if;
    update products p set stock = p.stock + s.qty
    from (select product_id, sum(qty) as qty from order_items
          where order_id = p_order_id and product_id is not null
          group by product_id) s
    where p.id = s.product_id;
    v_next := 'cancelled';
    v_note := 'Pesanan dibatalkan';
  elsif p_action = 'next' then
    v_next := case v_status
      when 'ordered' then 'packed'
      when 'packed' then 'shipped'
      when 'shipped' then 'delivered'
    end;
    if v_next is null then raise exception 'NO_NEXT_STATUS'; end if;
    v_note := case v_next
      when 'packed' then 'Pesanan dikemas penjual'
      when 'shipped' then 'Pesanan dikirim kurir'
      else 'Pesanan sampai di tujuan'
    end;
  else
    raise exception 'BAD_ACTION';
  end if;

  update orders set status = v_next where id = p_order_id;
  insert into order_tracking (order_id, status, note) values (p_order_id, v_next, v_note);
  return v_next;
end;
$$;

-- Function cuma boleh dipanggil API (service role), bukan dari public key.
revoke execute on function public.create_order(bigint, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.update_order_status(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.create_order(bigint, text, text, text, text) to service_role;
grant execute on function public.update_order_status(bigint, bigint, text) to service_role;

-- ============ DATA CONTOH ============

insert into public.delivery_options (code, name, fee, eta) values
  ('regular', 'Regular', 15000, '3 - 5 hari kerja'),
  ('express', 'Express', 30000, '1 - 2 hari kerja')
on conflict (code) do nothing;

insert into public.payment_methods (code, name) values
  ('transfer', 'Bank Transfer'),
  ('ewallet', 'E-Wallet'),
  ('card', 'Credit Card'),
  ('cod', 'Cash on Delivery')
on conflict (code) do nothing;

insert into public.vouchers (code, type, value, max_discount, min_spend) values
  ('HEMAT10', 'percent', 10, 100000, 500000),
  ('DISKON50K', 'fixed', 50000, null, 750000),
  ('ONGKIR', 'fixed', 15000, null, 0)
on conflict (code) do nothing;

insert into public.categories (name, image) values
  ('Running', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80'),
  ('Lifestyle', 'https://images.unsplash.com/photo-1600269452121-4f2416e55c28?w=600&q=80'),
  ('Training', 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=600&q=80'),
  ('Skate', 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=600&q=80'),
  ('Basketball', 'https://images.unsplash.com/photo-1597045566677-8cf032ed6634?w=600&q=80')
on conflict (name) do nothing;

insert into public.products
  (category_id, slug, name, brand, description, price, old_price, rating, review_count, stock, colors, sizes, images, created_at)
select c.id, v.slug, v.name, v.brand, v.description, v.price, v.old_price, v.rating, v.review_count,
       v.stock, v.colors, v.sizes, v.images, now() - (v.age_days || ' days')::interval
from (values
  ('Running', 'nmd-red-black', 'NMD R1 Red Black', 'Adidas',
   'Sneaker harian dengan sol empuk dan upper knit yang adem dipakai seharian.',
   1899000, 2299000, 4.8, 124, 20, '{Black,Red}'::text[], '{39,40,41,42,43}'::text[],
   '{https://i.ibb.co.com/T4fvcQ3/sepatu-merah.png}'::text[], 30),
  ('Running', 'ultraboost-black', 'Ultraboost Core Black', 'Adidas',
   'Sepatu lari dengan bantalan responsif buat jarak jauh.',
   2599000, null, 4.9, 210, 15, '{Black,Purple}', '{40,41,42,43,44}',
   '{https://i.ibb.co.com/dk0tNQ7/sepatu-hitam.png}', 1),
  ('Running', 'free-run-flyknit-red', 'Free Run Flyknit Red', 'Nike',
   'Ringan dan lentur, cocok buat lari pagi atau jalan santai.',
   1599000, 1899000, 4.6, 88, 25, '{Red}', '{39,40,41,42}',
   '{https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80}', 20),
  ('Training', 'superrep-volt', 'SuperRep Go Volt', 'Nike',
   'Sepatu training buat HIIT dan kelas gym, grip kuat di lantai.',
   1499000, null, 4.5, 64, 18, '{Volt,Black}', '{40,41,42,43}',
   '{https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800&q=80}', 3),
  ('Lifestyle', 'air-max-one-orange', 'Air Max One Orange', 'Nike',
   'Klasik dengan bantalan udara yang kelihatan dari samping.',
   1799000, 2099000, 4.7, 156, 12, '{White,Orange}', '{38,39,40,41,42}',
   '{https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800&q=80}', 25),
  ('Lifestyle', 'af1-shadow-pastel', 'Force 1 Shadow Pastel', 'Nike',
   'Lapisan ganda warna pastel, tinggi sol bikin kaki kelihatan jenjang.',
   1699000, null, 4.8, 302, 10, '{Pastel}', '{36,37,38,39,40}',
   '{https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&q=80}', 2),
  ('Lifestyle', 'af1-low-tan', 'Force 1 Low Tan', 'Nike',
   'Kanvas warna tan dengan detail kulit, gampang dipadu outfit apa aja.',
   1899000, null, 4.6, 75, 8, '{Tan,Black}', '{40,41,42,43}',
   '{https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&q=80}', 15),
  ('Lifestyle', 'smash-white', 'Smash V2 White', 'Puma',
   'Sneaker putih bersih bahan kulit sintetis, gampang dirawat.',
   799000, 999000, 4.4, 51, 30, '{White}', '{39,40,41,42,43,44}',
   '{https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800&q=80}', 40),
  ('Lifestyle', 'chunky-multicolor', 'Chunky Runner Multicolor', 'Fila',
   'Siluet chunky dengan kombinasi warna yang rame.',
   1199000, null, 4.3, 39, 14, '{Multicolor}', '{37,38,39,40}',
   '{https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=800&q=80}', 4),
  ('Skate', 'old-skool-maroon', 'Old Skool Maroon', 'Vans',
   'Kanvas dan suede dengan side stripe ikonik, sol waffle buat skate.',
   899000, null, 4.7, 190, 22, '{Maroon,Black}', '{38,39,40,41,42,43}',
   '{https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800&q=80}', 50),
  ('Running', 'air-max-90-orange', 'Air Max 90 Orange', 'Nike',
   'Warna oranye cerah dengan bantalan udara di tumit.',
   1999000, 2399000, 4.8, 143, 9, '{Orange,Navy}', '{40,41,42,43}',
   '{https://images.unsplash.com/photo-1514989940723-e8e51635b782?w=800&q=80}', 35),
  ('Lifestyle', 'af1-triple-white', 'Force 1 Triple White', 'Nike',
   'Putih polos semua, sneaker sejuta umat.',
   1549000, null, 4.9, 512, 40, '{White}', '{38,39,40,41,42,43,44}',
   '{https://images.unsplash.com/photo-1600269452121-4f2416e55c28?w=800&q=80}', 60),
  ('Lifestyle', 'x90-pink', 'X-90 Pink', 'New Balance',
   'Model futuristik dengan warna pink lembut.',
   1399000, 1699000, 4.5, 47, 11, '{Pink,Grey}', '{36,37,38,39}',
   '{https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2?w=800&q=80}', 6),
  ('Skate', 'sb-dunk-high-pastel', 'SB Dunk High Pastel', 'Nike',
   'High top buat skate, padding tebal di pergelangan.',
   2199000, null, 4.7, 98, 6, '{Cream,Pink,Blue}', '{40,41,42}',
   '{https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=800&q=80}', 5),
  ('Lifestyle', 'court-white-grey', 'Court Classic White', 'Local Brand',
   'Sneaker lokal minimalis dengan aksen abu di tumit.',
   499000, 649000, 4.2, 33, 50, '{White}', '{38,39,40,41,42,43}',
   '{https://images.unsplash.com/photo-1587563871167-1ee9c731aefb?w=800&q=80}', 7),
  ('Basketball', 'jordan-1-mid-red', 'Jordan 1 Mid Red Black', 'Jordan',
   'Basket klasik warna merah hitam putih, mid cut nyaman di pergelangan.',
   2299000, 2599000, 4.9, 401, 7, '{White,Red,Black}', '{40,41,42,43,44}',
   '{https://images.unsplash.com/photo-1597045566677-8cf032ed6634?w=800&q=80}', 0)
) as v(category, slug, name, brand, description, price, old_price, rating, review_count,
       stock, colors, sizes, images, age_days)
join public.categories c on c.name = v.category
on conflict (slug) do nothing;
