import { supabase } from "../lib/supabase.js";
import { queryOf, readForm, reply, toInt, withUser } from "../lib/http.js";
import { CARD_COLUMNS, toCard } from "../lib/products.js";

// GET /bcompose/wishlist.php -> daftar produk di wishlist
export const GET = withUser(async (request, user) => {
  const { data, error } = await supabase
    .from("wishlists")
    .select(`created_at, product:products(${CARD_COLUMNS})`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const items = data.map((w) => ({ ...toCard(w.product), is_wishlist: true }));
  return reply(200, items.length ? "Wishlist Success" : "Wishlist is empty", items);
});

// POST /bcompose/wishlist.php  body: product_id
export const POST = withUser(async (request, user) => {
  const form = await readForm(request);
  const productId = toInt(form?.get("product_id"));
  if (!productId) return reply(400, "product_id wajib diisi");

  const { error } = await supabase
    .from("wishlists")
    .upsert({ user_id: user.id, product_id: productId }, { ignoreDuplicates: true });

  // 23503 = product_id gak ada di tabel products
  if (error?.code === "23503") return reply(404, "Produk tidak ditemukan");
  if (error) throw error;

  return reply(200, "Masuk wishlist");
});

// DELETE /bcompose/wishlist.php?product_id=1
export const DELETE = withUser(async (request, user) => {
  const productId = toInt(queryOf(request).get("product_id"));
  if (!productId) return reply(400, "product_id wajib diisi");

  const { error } = await supabase
    .from("wishlists")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", productId);
  if (error) throw error;

  return reply(200, "Dihapus dari wishlist");
});
