import { serverError, reply, unauthorized, userFromBearer } from "../lib/http.js";

// GET /bcompose/profile.php
// Header: Authorization: Bearer <token>
export async function GET(request) {
  const { user, error } = await userFromBearer(request);
  if (error) return serverError(error);
  if (!user) return unauthorized();

  return reply(200, "Profile Success", {
    name: user.name,
    address: user.address,
    profil: user.profil,
  });
}
