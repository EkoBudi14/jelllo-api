import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const json = (code, body) => Response.json({ code, ...body }, { status: code });

// POST /api/signin (juga /bcompose/signin.php via vercel.json)
// Body: form-data atau x-www-form-urlencoded -> email, password
export async function POST(request) {
  let email;
  let password;

  try {
    const form = await request.formData();
    email = form.get("email")?.toString().trim();
    password = form.get("password")?.toString();
  } catch {
    return json(400, { message: "Body harus form-data atau x-www-form-urlencoded" });
  }

  if (!email || !password) {
    return json(400, { message: "Email dan password wajib diisi" });
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("email, password_hash, name, address, profil")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error(error);
    return json(500, { message: "Something went wrong" });
  }

  const valid = user && (await bcrypt.compare(password, user.password_hash));
  if (!valid) {
    return json(401, { message: "Email atau password salah" });
  }

  return json(200, {
    message: "Signin Success",
    data: {
      name: user.name,
      address: user.address,
      token: randomBytes(16).toString("hex"),
      profil: user.profil,
    },
  });
}
