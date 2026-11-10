import { supabase } from "../lib/supabase.js";
import { reply, withUser } from "../lib/http.js";

// GET /bcompose/categories.php
export const GET = withUser(async () => {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, image, products(count)")
    .order("id");
  if (error) throw error;

  return reply(
    200,
    "Categories Success",
    data.map((c) => ({
      id: c.id,
      name: c.name,
      image: c.image,
      product_count: c.products[0]?.count ?? 0,
    }))
  );
});
