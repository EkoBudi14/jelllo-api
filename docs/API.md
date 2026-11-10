# Jelllo API

Base URL: `https://jelllo-api.vercel.app`

Semua response bentuknya sama:

```json
{ "code": 200, "message": "...", "data": ... }
```

Semua endpoint selain `signin` dan `signup` butuh header:

```
Authorization: Bearer <token dari signin>
```

Body pakai **form-data** atau **x-www-form-urlencoded** (sama kayak signin). Harga dalam Rupiah (angka bulat).

## Setup sekali

Jalankan `supabase/003_shop.sql` di Supabase → SQL Editor. Isinya tabel baru, 16 produk contoh, 5 kategori, 3 voucher.

## Flow belanja

```
signin ──► home / categories ──► products (search, filter, sort)
                                      │
                                      ▼
                                product detail ──► wishlist (simpan dulu)
                                      │
                                      ▼ pilih warna + ukuran
                                     cart (ubah qty / hapus)
                                      │
                                      ▼
                     checkout GET (preview: ongkir, voucher, total)
                                      │
                                      ▼
                     checkout POST ──► order dibuat, stok berkurang, cart kosong
                                      │
                                      ▼
                     orders (riwayat) ──► orders?id= (detail + track order)
                                      │
                       PATCH next: ordered → packed → shipped → delivered
                       PATCH cancel: cuma saat masih ordered, stok balik
```

---

## 1. Kategori

### `GET /bcompose/categories.php`

```json
"data": [
  { "id": 1, "name": "Running", "image": "https://...", "product_count": 5 }
]
```

## 2. Produk

### `GET /bcompose/products.php`

Semua query opsional, bisa digabung:

| Query | Contoh | Arti |
|---|---|---|
| `q` | `air max` | cari di nama dan brand |
| `category_id` | `2` | filter kategori |
| `min_price`, `max_price` | `500000`, `1500000` | rentang harga |
| `min_rating` | `4.5` | rating minimal |
| `sort` | `newest` (default), `price_asc`, `price_desc`, `rating`, `popular` | urutan |
| `page`, `limit` | `1`, `10` (max 50) | halaman |

Contoh: `/bcompose/products.php?q=nike&min_rating=4.7&sort=price_asc&page=1&limit=10`

```json
"data": {
  "items": [
    {
      "id": 3, "name": "Free Run Flyknit Red", "brand": "Nike",
      "image": "https://...", "price": 1599000, "old_price": 1899000, "discount": 16,
      "rating": 4.6, "review_count": 88, "in_stock": true, "is_new": false,
      "is_wishlist": false, "category": { "id": 1, "name": "Running" }
    }
  ],
  "page": 1, "limit": 10, "total": 16, "total_pages": 2
}
```

Tips layar Figma:
- **POPULAR** → `sort=popular`
- **NEW PRODUCT** → `sort=newest` (atau cek `is_new`)
- **SPECIAL OFFER** → filter item yang `discount > 0`
- **See All** → pakai `page` buat infinite scroll

### `GET /bcompose/product.php?id=3`

Isi kayak item di atas, ditambah:

```json
"description": "...", "stock": 25,
"colors": ["Red"], "sizes": ["39", "40", "41", "42"],
"images": ["https://..."],
"related": [ /* 4 produk sekategori */ ]
```

## 3. Wishlist

| Method | URL | Body | Arti |
|---|---|---|---|
| GET | `/bcompose/wishlist.php` | - | daftar produk (message `Wishlist is empty` kalau kosong) |
| POST | `/bcompose/wishlist.php` | `product_id` | tambah (dua kali tambah tetap satu) |
| DELETE | `/bcompose/wishlist.php?product_id=3` | - | hapus |

Tombol love di app: kalau `is_wishlist` true → DELETE, kalau false → POST.

## 4. Cart

| Method | URL | Body | Arti |
|---|---|---|---|
| GET | `/bcompose/cart.php` | - | isi cart |
| POST | `/bcompose/cart.php` | `product_id`, `qty` (default 1), `color`, `size` | tambah. Barang + warna + ukuran sama → qty ditambah |
| PUT | `/bcompose/cart.php` | `id` (id baris cart), `qty` | ubah qty, `qty=0` = hapus |
| DELETE | `/bcompose/cart.php?id=5` | - | hapus satu baris |
| DELETE | `/bcompose/cart.php` | - | kosongkan cart |

`color` dan `size` wajib salah satu dari `colors` / `sizes` produk. Qty gak boleh lebih dari stok.

Semua method cart balikin isi cart terbaru:

```json
"data": {
  "items": [
    { "id": 5, "product_id": 3, "name": "Free Run Flyknit Red", "brand": "Nike",
      "image": "https://...", "price": 1599000, "qty": 2, "color": "Red", "size": "40",
      "stock": 25, "line_total": 3198000 }
  ],
  "total_qty": 2,
  "subtotal": 3198000
}
```

## 5. Checkout

### `GET /bcompose/checkout.php?delivery=regular&voucher=HEMAT10`

Preview sebelum bayar. Dua query opsional. Panggil ulang tiap user ganti pengiriman atau masukin voucher.

```json
"data": {
  "address": "Depok",
  "cart": { ... },
  "delivery_options": [
    { "code": "regular", "name": "Regular", "fee": 15000, "eta": "3 - 5 hari kerja" },
    { "code": "express", "name": "Express", "fee": 30000, "eta": "1 - 2 hari kerja" }
  ],
  "payment_methods": [ { "code": "transfer", "name": "Bank Transfer" }, ... ],
  "voucher": { "code": "HEMAT10", "valid": true, "message": "Voucher dipakai" },
  "summary": { "subtotal": 3198000, "discount": 100000, "delivery": "regular",
               "delivery_fee": 15000, "total": 3113000 }
}
```

Voucher contoh:

| Kode | Potongan | Minimal belanja |
|---|---|---|
| `HEMAT10` | 10%, max 100.000 | 500.000 |
| `DISKON50K` | 50.000 | 750.000 |
| `ONGKIR` | 15.000 | - |

### `POST /bcompose/checkout.php`

| Body | Wajib | Isi |
|---|---|---|
| `delivery` | ya | `regular` / `express` |
| `payment_method` | ya | `transfer` / `ewallet` / `card` / `cod` |
| `address` | tidak | default alamat profil |
| `voucher` | tidak | kode voucher |

Balikin detail order (sama kayak `orders.php?id=`). Error 400 yang mungkin muncul: `Cart masih kosong`, `Stok tidak cukup: <nama>`, `Voucher tidak valid`, `Voucher butuh belanja minimal ...`.

## 6. Order

### `GET /bcompose/orders.php` (opsional `?status=shipped`)

Status: `ordered`, `packed`, `shipped`, `delivered`, `cancelled`.

```json
"data": [
  { "id": 1, "code": "OD-261110-1", "status": "ordered", "total": 3113000,
    "created_at": "...", "item_count": 2,
    "first_item": { "name": "...", "image": "...", "qty": 2 } }
]
```

### `GET /bcompose/orders.php?id=1`

Detail buat layar **View Order** dan **Track Order**:

```json
"data": {
  "id": 1, "code": "OD-261110-1", "status": "shipped",
  "address": "Depok", "delivery": "regular", "delivery_fee": 15000,
  "payment_method": "cod", "voucher_code": "HEMAT10",
  "subtotal": 3198000, "discount": 100000, "total": 3113000,
  "items": [ { "id": 1, "product_id": 3, "name": "...", "image": "...",
               "price": 1599000, "qty": 2, "color": "Red", "size": "40" } ],
  "tracking": [
    { "status": "ordered", "note": "Pesanan dibuat", "created_at": "..." },
    { "status": "packed", "note": "Pesanan dikemas penjual", "created_at": "..." },
    { "status": "shipped", "note": "Pesanan dikirim kurir", "created_at": "..." }
  ]
}
```

### `PATCH /bcompose/orders.php`

Body: `id`, `action`.
- `action=next` → maju satu status. Ini **simulasi kurir buat belajar**. Di app beneran, user gak boleh punya tombol ini.
- `action=cancel` → batal, cuma bisa saat `ordered`. Stok balik.

---

## Coba pakai curl

```bash
TOKEN=$(curl -s -X POST https://jelllo-api.vercel.app/bcompose/signin.php \
  -F email=test@user.com -F password=<password> | sed 's/.*"token":"\([^"]*\)".*/\1/')
H="Authorization: Bearer $TOKEN"
API=https://jelllo-api.vercel.app/bcompose

curl -s -H "$H" "$API/products.php?sort=popular&limit=3"
curl -s -H "$H" "$API/product.php?id=3"
curl -s -H "$H" -X POST "$API/wishlist.php" -F product_id=3
curl -s -H "$H" -X POST "$API/cart.php" -F product_id=3 -F qty=2 -F color=Red -F size=40
curl -s -H "$H" "$API/checkout.php?delivery=express&voucher=HEMAT10"
curl -s -H "$H" -X POST "$API/checkout.php" -F delivery=express -F payment_method=cod -F voucher=HEMAT10
curl -s -H "$H" "$API/orders.php"
curl -s -H "$H" -X PATCH "$API/orders.php" -F id=1 -F action=next
```

## Ide ngulik selanjutnya

- Review + rating beneran (cuma boleh setelah order `delivered`), lalu hitung ulang `rating` produk.
- Home ambil dari DB, bukan statis.
- Banyak alamat per user (layar Shipping Address).
- Notifikasi tiap status order berubah.
