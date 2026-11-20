import { supabase } from "../lib/supabase.js";
import { reply, withUser } from "../lib/http.js";
import { CARD_COLUMNS, toCard, wishlistIdsOf } from "../lib/products.js";

// Banner masih statis. Ubah di sini kalau mau ganti.
const HEADER = [
  "https://i.ibb.co.com/HBg06dM/sample-slide1.png",
  "https://jelllo-api.vercel.app/banner/slide2.png",
  "https://jelllo-api.vercel.app/banner/slide3.png",
].map((image, i) => ({ id: i + 1, image }));

const NEW_PRODUCT_LIMIT = 6;

// GET /bcompose/home.php
// Header: Authorization: Bearer <token>
// Kategori dan produk diambil dari DB, jadi id-nya sama dengan
// categories.php / product.php?id= dan gambarnya cocok.
export const GET = withUser(async (request, user) => {
  const [categories, products, wishlistIds] = await Promise.all([
    supabase.from("categories").select("id, name, image").order("id"),
    supabase
      .from("products")
      .select(CARD_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(NEW_PRODUCT_LIMIT),
    wishlistIdsOf(supabase, user.id),
  ]);
  if (categories.error) throw categories.error;
  if (products.error) throw products.error;

  return reply(200, "Home Success", {
    header: HEADER,
    body: [
      { title: "CATEGORIES", data: categories.data },
      { title: "NEW PRODUCT", data: products.data.map((p) => toCard(p, wishlistIds)) },
    ],
  });
});
