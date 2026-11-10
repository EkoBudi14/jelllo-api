// Detail satu order punya user. Balikin null kalau gak ada.
export async function orderDetail(supabase, userId, orderId) {
  const { data, error } = await supabase
    .from("orders")
    .select(
      `id, code, status, address, delivery, delivery_fee, payment_method, voucher_code,
       subtotal, discount, total, created_at,
       items:order_items(id, product_id, name, image, price, qty, color, size),
       tracking:order_tracking(status, note, created_at)`
    )
    .eq("id", orderId)
    .eq("user_id", userId)
    .order("id", { referencedTable: "order_items" })
    .order("id", { referencedTable: "order_tracking" })
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Kode error dari function SQL -> [http code, pesan buat user].
export function sqlErrorToReply(message = "") {
  const [codeName, detail] = message.split(":");
  const map = {
    CART_EMPTY: [400, "Cart masih kosong"],
    OUT_OF_STOCK: [400, `Stok tidak cukup: ${detail}`],
    BAD_VOUCHER: [400, "Voucher tidak valid"],
    VOUCHER_MIN_SPEND: [400, `Voucher butuh belanja minimal ${detail}`],
    BAD_DELIVERY: [400, "delivery tidak valid"],
    BAD_PAYMENT: [400, "payment_method tidak valid"],
    NO_ADDRESS: [400, "Alamat wajib diisi"],
    ORDER_NOT_FOUND: [404, "Order tidak ditemukan"],
    CANNOT_CANCEL: [400, "Order cuma bisa dibatalkan sebelum dikemas"],
    NO_NEXT_STATUS: [400, "Order sudah selesai"],
    BAD_ACTION: [400, "action harus next atau cancel"],
  };
  return map[codeName] ?? null;
}

// Hitung potongan voucher. Rumusnya harus sama dengan function create_order di SQL.
export function voucherDiscount(voucher, subtotal) {
  if (voucher.type === "percent") {
    const cut = Math.floor((subtotal * voucher.value) / 100);
    return Math.min(cut, voucher.max_discount ?? subtotal);
  }
  return Math.min(voucher.value, subtotal);
}
