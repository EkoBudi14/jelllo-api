import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase.js";
import { readForm, reply, serverError } from "../lib/http.js";

const DEFAULT_PROFIL = "https://avatars.githubusercontent.com/u/8241782?v=4";

// POST /bcompose/signup.php
// Body (form-data / x-www-form-urlencoded): username, email, password
export async function POST(request) {
  const form = await readForm(request);
  if (!form) return reply(400, "Body harus form-data atau x-www-form-urlencoded");

  const username = form.get("username")?.toString().trim();
  const email = form.get("email")?.toString().trim().toLowerCase();
  const password = form.get("password")?.toString();

  if (!username || !email || !password) {
    return reply(400, "Username, email, dan password wajib diisi");
  }

  const { error } = await supabase.from("users").insert({
    email,
    password_hash: await bcrypt.hash(password, 10),
    name: username,
    profil: DEFAULT_PROFIL,
    token: randomBytes(16).toString("hex"),
  });

  // 23505 = unique violation, email sudah dipakai
  if (error?.code === "23505") return reply(409, "Email sudah terdaftar");
  if (error) return serverError(error);

  return reply(200, "Signup Success");
}
