import { apiUrl } from "./apiBase.js";
import { getAdminToken } from "./session.js";

/** طلبات `/api/admin/*` مع ترويسة Bearer من الجلسة الحالية. */
export async function authFetch(path, options = {}) {
  const token = getAdminToken();
  const headers = { ...options.headers, Authorization: `Bearer ${token}` };
  if (options.body && typeof options.body === "string" && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(apiUrl(path), { ...options, headers });
}
