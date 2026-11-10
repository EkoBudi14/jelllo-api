import { supabase } from "../lib/supabase.js";
import { queryOf, readForm, reply, withUser } from "../lib/http.js";
import { cartOf } from "../lib/cart.js";
import { orderDetail, sqlErrorToReply, voucherDiscount } from "../lib/orders.js";

// GET /bcompose/checkout.php?delivery=regular&voucher=HEMAT10
// Ringkasan sebelum bayar: isi cart, pilihan kirim & bayar, cek voucher, total.
export const GET = withUser(async (request, user) => {
  const params = queryOf(request);
  const code = (params.get("voucher") || "").trim().toUpperCase();

  const [cart, deliveries, payments, voucherRes] = await Promise.all([
    cartOf(supabase, user.id),
    supabase.from("delivery_options").select("code, name, fee, eta").order("fee"),
    supabase.from("payment_methods").select("code, name"),
    code
      ? supabase.from("vouchers").select("*").eq("code", code).eq("active", true).maybeSingle()
      : { data: null },
  ]);
  for (const res of [deliveries, payments, voucherRes]) if (res.error) throw res.error;

  const delivery =
    deliveries.data.find((d) => d.code === params.get("delivery")) ?? deliveries.data[0];

  let discount = 0;
  let voucher = null;
  if (code) {
    const v = voucherRes.data;
    if (!v) voucher = { code, valid: false, message: "Voucher tidak valid" };
    else if (cart.subtotal < v.min_spend)
      voucher = { code, valid: false, message: `Belanja minimal ${v.min_spend}` };
    else {
      discount = voucherDiscount(v, cart.subtotal);
      voucher = { code, valid: true, message: "Voucher dipakai" };
    }
  }

  return reply(200, "Checkout Preview", {
    address: user.address,
    cart,
    delivery_options: deliveries.data,
    payment_methods: payments.data,
    voucher,
    summary: {
      subtotal: cart.subtotal,
      discount,
      delivery: delivery?.code ?? null,
      delivery_fee: delivery?.fee ?? 0,
      total: cart.items.length ? cart.subtotal - discount + (delivery?.fee ?? 0) : 0,
    },
  });
});

// POST /bcompose/checkout.php
// body: delivery, payment_method, address (opsional, default alamat profil), voucher (opsional)
// Cart jadi order, stok berkurang, cart dikosongkan.
export const POST = withUser(async (request, user) => {
  const form = await readForm(request);
  if (!form) return reply(400, "Body harus form-data atau x-www-form-urlencoded");

  const { data: orderId, error } = await supabase.rpc("create_order", {
    p_user_id: user.id,
    p_address: form.get("address")?.toString() || user.address || "",
    p_delivery: form.get("delivery")?.toString() || "",
    p_payment: form.get("payment_method")?.toString() || "",
    p_voucher: form.get("voucher")?.toString() || null,
  });

  if (error) {
    const known = sqlErrorToReply(error.message);
    if (known) return reply(...known);
    throw error;
  }

  return reply(200, "Order Success", await orderDetail(supabase, user.id, orderId));
});
