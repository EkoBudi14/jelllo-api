import { supabase } from "../lib/supabase.js";
import { queryOf, reply, toInt, withUser } from "../lib/http.js";
import { CARD_COLUMNS, toCard, wishlistIdsOf } from "../lib/products.js";

const SORTS = {
  newest: ["created_at", false],
  price_asc: ["price", true],
  price_desc: ["price", false],
  rating: ["rating", false],
  popular: ["review_count", false],
};

// GET /bcompose/products.php
// Query (semua opsional):
//   q, category_id, min_price, max_price, min_rating,
//   sort = newest | price_asc | price_desc | rating | popular,
//   page (mulai 1), limit (max 50)
export const GET = withUser(async (request, user) => {
  const params = queryOf(request);

  const sort = params.get("sort") || "newest";
  if (!SORTS[sort]) return reply(400, `sort harus salah satu: ${Object.keys(SORTS).join(", ")}`);

  const page = Math.max(toInt(params.get("page")) || 1, 1);
  const limit = Math.min(Math.max(toInt(params.get("limit")) || 10, 1), 50);

  let query = supabase.from("products").select(CARD_COLUMNS, { count: "exact" });

  // Buang karakter yang punya arti khusus di filter PostgREST.
  const q = (params.get("q") || "").replace(/[%_,()*"\\]/g, " ").trim();
  if (q) query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%`);

  const categoryId = toInt(params.get("category_id"));
  if (categoryId !== null) query = query.eq("category_id", categoryId);

  const minPrice = toInt(params.get("min_price"));
  if (minPrice !== null) query = query.gte("price", minPrice);

  const maxPrice = toInt(params.get("max_price"));
  if (maxPrice !== null) query = query.lte("price", maxPrice);

  const minRating = Number(params.get("min_rating"));
  if (params.get("min_rating") && !Number.isNaN(minRating)) query = query.gte("rating", minRating);

  const [column, ascending] = SORTS[sort];
  query = query
    .order(column, { ascending })
    .order("id", { ascending: true })
    .range((page - 1) * limit, page * limit - 1);

  const [{ data, count, error }, wishlistIds] = await Promise.all([
    query,
    wishlistIdsOf(supabase, user.id),
  ]);
  if (error) throw error;

  return reply(200, "Products Success", {
    items: data.map((p) => toCard(p, wishlistIds)),
    page,
    limit,
    total: count,
    total_pages: Math.ceil(count / limit),
  });
});
