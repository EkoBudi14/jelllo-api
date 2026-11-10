import { supabase } from "../lib/supabase.js";
import { queryOf, readForm, reply, toInt, withUser } from "../lib/http.js";
import { cartOf } from "../lib/cart.js";

const MAX_QTY = 99;

// GET /bcompose/cart.php -> isi cart + subtotal
export const GET = withUser(async (request, user) => {
  const cart = await cartOf(supabase, user.id);
  return reply(200, cart.items.length ? "Cart Success" : "Cart is empty", cart);
});

// POST /bcompose/cart.php  body: product_id, qty (default 1), color, size
// Barang sama (warna + ukuran sama) -> qty ditambah, bukan baris baru.
export const POST = withUser(async (request, user) => {
  const form = await readForm(request);
  const productId = toInt(form?.get("product_id"));
  const qty = toInt(form?.get("qty") ?? 1);
  const color = form?.get("color")?.toString().trim() || "";
  const size = form?.get("size")?.toString().trim() || "";

  if (!productId) return reply(400, "product_id wajib diisi");
  if (!qty) return reply(400, "qty minimal 1");

  const { data: product, error } = await supabase
    .from("products")
    .select("id, stock, colors, sizes")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw error;
  if (!product) return reply(404, "Produk tidak ditemukan");

  if (product.colors.length && !product.colors.includes(color)) {
    return reply(400, `color harus salah satu: ${product.colors.join(", ")}`);
  }
  if (product.sizes.length && !product.sizes.includes(size)) {
    return reply(400, `size harus salah satu: ${product.sizes.join(", ")}`);
  }

  const { data: existing, error: findError } = await supabase
    .from("cart_items")
    .select("id, qty")
    .eq("user_id", user.id)
    .eq("product_id", productId)
    .eq("color", color)
    .eq("size", size)
    .maybeSingle();
  if (findError) throw findError;

  const newQty = (existing?.qty ?? 0) + qty;
  if (newQty > product.stock) return reply(400, `Stok cuma ${product.stock}`);
  if (newQty > MAX_QTY) return reply(400, `Maksimal ${MAX_QTY} per barang`);

  const { error: saveError } = existing
    ? await supabase.from("cart_items").update({ qty: newQty }).eq("id", existing.id)
    : await supabase
        .from("cart_items")
        .insert({ user_id: user.id, product_id: productId, qty, color, size });
  if (saveError) throw saveError;

  return reply(200, "Masuk cart", await cartOf(supabase, user.id));
});

// PUT /bcompose/cart.php  body: id (id baris cart), qty. qty 0 = hapus.
export const PUT = withUser(async (request, user) => {
  const form = await readForm(request);
  const id = toInt(form?.get("id"));
  const qty = toInt(form?.get("qty"));
  if (!id || qty === null) return reply(400, "id dan qty wajib diisi");

  const { data: item, error } = await supabase
    .from("cart_items")
    .select("id, product:products(stock)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!item) return reply(404, "Barang tidak ada di cart");

  if (qty > item.product.stock) return reply(400, `Stok cuma ${item.product.stock}`);
  if (qty > MAX_QTY) return reply(400, `Maksimal ${MAX_QTY} per barang`);

  const { error: saveError } =
    qty === 0
      ? await supabase.from("cart_items").delete().eq("id", id)
      : await supabase.from("cart_items").update({ qty }).eq("id", id);
  if (saveError) throw saveError;

  return reply(200, "Cart diubah", await cartOf(supabase, user.id));
});

// DELETE /bcompose/cart.php?id=5  -> hapus satu baris
// DELETE /bcompose/cart.php       -> kosongkan cart
export const DELETE = withUser(async (request, user) => {
  const rawId = queryOf(request).get("id");
  const id = toInt(rawId);
  if (rawId !== null && !id) return reply(400, "id tidak valid");

  let query = supabase.from("cart_items").delete().eq("user_id", user.id);
  if (id) query = query.eq("id", id);
  const { error } = await query;
  if (error) throw error;

  return reply(200, "Dihapus dari cart", await cartOf(supabase, user.id));
});
