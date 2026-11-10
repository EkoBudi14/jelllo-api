// Isi cart user + total. Dipakai cart.php dan checkout.php.
export async function cartOf(supabase, userId) {
  const { data, error } = await supabase
    .from("cart_items")
    .select("id, qty, color, size, product:products(id, name, brand, price, stock, images)")
    .eq("user_id", userId)
    .order("id");
  if (error) throw error;

  const items = data.map((c) => ({
    id: c.id,
    product_id: c.product.id,
    name: c.product.name,
    brand: c.product.brand,
    image: c.product.images?.[0] ?? null,
    price: c.product.price,
    qty: c.qty,
    color: c.color,
    size: c.size,
    stock: c.product.stock,
    line_total: c.product.price * c.qty,
  }));

  return {
    items,
    total_qty: items.reduce((sum, i) => sum + i.qty, 0),
    subtotal: items.reduce((sum, i) => sum + i.line_total, 0),
  };
}
