import { supabase } from "./supabase.js";

// Semua response pakai bentuk { code, message, data }, sama kayak dokumen API.
export const reply = (code, message, data = null) =>
  Response.json({ code, message, data }, { status: code });

export const serverError = (error) => {
  console.error(error);
  return reply(500, "Something went wrong");
};

// Baca body form-data atau x-www-form-urlencoded. Balikin null kalau formatnya lain.
export async function readForm(request) {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

// Cek header "Authorization: Bearer <token>". Balikin user, atau null kalau token salah.
export async function userFromBearer(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { user: null };

  const { data: user, error } = await supabase
    .from("users")
    .select("name, address, profil")
    .eq("token", match[1].trim())
    .maybeSingle();

  return { user, error };
}

export const unauthorized = () => reply(401, "Unauthorized: Invalid Bearer Token");
