import { supabase } from "../lib/supabase.js";
import { queryOf, reply, toInt, withUser } from "../lib/http.js";
import { CARD_COLUMNS, toCard, wishlistIdsOf } from "../lib/products.js";

// GET /bcompose/product.php?id=1
export const GET = withUser(async (request, user) => {
  const id = toInt(queryOf(request).get("id"));
  if (!id) return reply(400, "id produk wajib diisi");

  const { data: p, error } = await supabase
    .from("products")
    .select(`${CARD_COLUMNS}, description, colors, sizes, category_id`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!p) return reply(404, "Produk tidak ditemukan");

  const [related, wishlistIds] = await Promise.all([
    supabase
      .from("products")
      .select(CARD_COLUMNS)
      .eq("category_id", p.category_id)
      .neq("id", p.id)
      .order("rating", { ascending: false })
      .limit(4),
    wishlistIdsOf(supabase, user.id),
  ]);
  if (related.error) throw related.error;

  return reply(200, "Product Success", {
    ...toCard(p, wishlistIds),
    description: p.description,
    stock: p.stock,
    colors: p.colors,
    sizes: p.sizes,
    images: p.images,
    related: related.data.map((r) => toCard(r, wishlistIds)),
  });
});
