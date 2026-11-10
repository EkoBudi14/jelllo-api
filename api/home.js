import { serverError, reply, unauthorized, userFromBearer } from "../lib/http.js";

const img = (id, w = 600) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80`;
const list = (urls) => urls.map((image, i) => ({ id: i + 1, image }));

// Isi home masih statis. Ubah di sini kalau mau ganti banner atau produk.
const HOME = {
  header: list([
    "https://i.ibb.co.com/HBg06dM/sample-slide1.png",
    img("1542291026-7eec264c27ff", 1200),
    img("1549298916-b41d501d3772", 1200),
  ]),
  body: [
    {
      title: "CATEGORIES",
      data: list([
        "https://i.ibb.co.com/T4fvcQ3/sepatu-merah.png",
        img("1606107557195-0e29a4b5b4aa"),
        img("1600185365483-26d7a4cc7519"),
        img("1608231387042-66d1773070a5"),
        img("1525966222134-fcfa99b8ae77"),
        img("1551107696-a4b0c5a0d9a2"),
      ]),
    },
    {
      title: "NEW PRODUCT",
      data: list([
        "https://i.ibb.co.com/dk0tNQ7/sepatu-hitam.png",
        img("1595950653106-6c9ebd614d3a"),
        img("1560769629-975ec94e6a86"),
        img("1600269452121-4f2416e55c28"),
        img("1584735175315-9d5df23860e6"),
        img("1597045566677-8cf032ed6634"),
      ]),
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
