import { createApiClient, ApiError } from "./client.js";

function request(token) {
  return createApiClient({ baseUrl: "/api/v1", getAccessToken: () => token });
}
function segment(id) {
  if (typeof id !== "string" || !id || id === "." || id === "..") throw new ApiError("invalidRequest", "Invalid ID");
  return encodeURIComponent(id);
}
function write(token, method, path, body) {
  return request(token)(path, { method, body, idempotencyKey: crypto.randomUUID() });
}
export async function loginLocal(values, register = false) {
  const { email, password, fullName } = values;
  const payload = await request(null)(register ? "/auth/register" : "/auth/login", {
    method: "POST", auth: false, body: { email, password, ...(register ? { fullName } : {}) },
  });
  if (typeof payload?.accessToken !== "string" || !payload.accessToken || !payload.user?.id) throw new ApiError("invalidResponse", "Invalid local session");
  return { accessToken: payload.accessToken, user: payload.user };
}
export async function loadMine(token) {
  const get = request(token);
  const [favorites, loans] = await Promise.all([get("/me/favorites"), get("/me/loans")]);
  if (!Array.isArray(favorites?.items) || !Array.isArray(loans?.items)) throw new ApiError("invalidResponse", "Invalid account data");
  return { favoriteIds: favorites.items.map(book => book.id), loans: loans.items };
}
export function changeFavorite(token, id, save) {
  return write(token, save ? "PUT" : "DELETE", `/me/favorites/${segment(id)}`);
}
export function createLoan(token, bookId) { return write(token, "POST", "/loans", { bookId }); }
export function cancelLoan(token, row) { return write(token, "POST", `/loans/${segment(row.id)}/cancel`, { version: row.version }); }
export function logoutLocal(token) { return request(token)("/auth/logout", { method: "POST" }); }
