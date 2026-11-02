import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase.js";
import { readForm, reply, serverError } from "../lib/http.js";

// POST /bcompose/signin.php
// Body (form-data / x-www-form-urlencoded): email, password
export async function POST(request) {
  const form = await readForm(request);
  if (!form) return reply(400, "Body harus form-data atau x-www-form-urlencoded");

  // Email gak peka huruf besar. Simpan email di DB pakai huruf kecil.
  const email = form.get("email")?.toString().trim().toLowerCase();
  const password = form.get("password")?.toString();

  if (!email || !password) return reply(400, "Email dan password wajib diisi");

  const { data: user, error } = await supabase
    .from("users")
    .select("id, password_hash, name, address, profil")
    .eq("email", email)
    .maybeSingle();

  if (error) return serverError(error);

  const valid = user && (await bcrypt.compare(password, user.password_hash));
  if (!valid) return reply(201, "User tidak terdaftar");

  // Token baru tiap login. Token lama langsung gak berlaku.
  const token = randomBytes(32).toString("hex");
  const { error: updateError } = await supabase
    .from("users")
    .update({ token })
    .eq("id", user.id);

  if (updateError) return serverError(updateError);

  return reply(200, "Signin Success", {
    name: user.name,
    address: user.address,
    token,
    profil: user.profil,
  });
}
