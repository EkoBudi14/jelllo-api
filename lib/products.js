// Kolom produk yang dipakai di list/card.
export const CARD_COLUMNS =
  "id, name, brand, price, old_price, rating, review_count, stock, images, created_at, category:categories(id, name)";

// Produk baru = masuk 14 hari terakhir.
const NEW_DAYS = 14;

// Bentuk produk buat list, wishlist, cart. wishlistIds = Set id produk di wishlist user.
export function toCard(p, wishlistIds = new Set()) {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    image: p.images?.[0] ?? null,
    price: p.price,
    old_price: p.old_price,
    discount: p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : 0,
    rating: Number(p.rating),
    review_count: p.review_count,
    in_stock: p.stock > 0,
    is_new: Date.now() - new Date(p.created_at).getTime() < NEW_DAYS * 864e5,
    is_wishlist: wishlistIds.has(p.id),
    category: p.category,
  };
}

// Ambil Set id produk yang ada di wishlist user.
export async function wishlistIdsOf(supabase, userId) {
  const { data, error } = await supabase
    .from("wishlists")
    .select("product_id")
    .eq("user_id", userId);
  if (error) throw error;
  return new Set(data.map((w) => w.product_id));
}
