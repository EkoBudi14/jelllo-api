import { supabase } from "../lib/supabase.js";
import { queryOf, readForm, reply, toInt, withUser } from "../lib/http.js";
import { orderDetail, sqlErrorToReply } from "../lib/orders.js";

const STATUSES = ["ordered", "packed", "shipped", "delivered", "cancelled"];

// GET /bcompose/orders.php            -> riwayat order (opsional ?status=shipped)
// GET /bcompose/orders.php?id=1       -> detail + item + tracking
export const GET = withUser(async (request, user) => {
  const params = queryOf(request);

  if (params.has("id")) {
    const id = toInt(params.get("id"));
    const order = id && (await orderDetail(supabase, user.id, id));
    if (!order) return reply(404, "Order tidak ditemukan");
    return reply(200, "Order Success", order);
  }

  const status = params.get("status");
  if (status && !STATUSES.includes(status)) {
    return reply(400, `status harus salah satu: ${STATUSES.join(", ")}`);
  }

  let query = supabase
    .from("orders")
    .select("id, code, status, total, created_at, items:order_items(name, image, qty)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { referencedTable: "order_items" });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;

  const orders = data.map(({ items, ...o }) => ({
    ...o,
    item_count: items.reduce((sum, i) => sum + i.qty, 0),
    first_item: items[0] ?? null,
  }));
  return reply(200, orders.length ? "Orders Success" : "Order is empty", orders);
});

// PATCH /bcompose/orders.php  body: id, action = next | cancel
// next   = maju satu status (simulasi kurir, buat belajar)
// cancel = batal, cuma saat status masih 'ordered'
export const PATCH = withUser(async (request, user) => {
  const form = await readForm(request);
  const id = toInt(form?.get("id"));
  const action = form?.get("action")?.toString();
  if (!id || !action) return reply(400, "id dan action wajib diisi");

  const { error } = await supabase.rpc("update_order_status", {
    p_user_id: user.id,
    p_order_id: id,
    p_action: action,
  });

  if (error) {
    const known = sqlErrorToReply(error.message);
    if (known) return reply(...known);
    throw error;
  }

  return reply(200, "Status diubah", await orderDetail(supabase, user.id, id));
});
