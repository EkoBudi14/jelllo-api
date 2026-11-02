import { serverError, reply, unauthorized, userFromBearer } from "../lib/http.js";

// Isi home masih statis. Ubah di sini kalau mau ganti banner atau produk.
const HOME = {
  header: [
    { id: 1, image: "https://i.ibb.co.com/HBg06dM/sample-slide1.png" },
  ],
  body: [
    {
      title: "CATEGORIES",
      data: [{ id: 1, image: "https://i.ibb.co.com/T4fvcQ3/sepatu-merah.png" }],
    },
    {
      title: "NEW PRODUCT",
      data: [{ id: 1, image: "https://i.ibb.co.com/dk0tNQ7/sepatu-hitam.png" }],
    },
  ],
};

// GET /bcompose/home.php
// Header: Authorization: Bearer <token>
export async function GET(request) {
  const { user, error } = await userFromBearer(request);
  if (error) return serverError(error);
  if (!user) return unauthorized();

  return reply(200, "Home Success", HOME);
}
