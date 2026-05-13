/** مسارات ثابتة داخل مجلد `admin/` — تُستخدم في تسجيل الدخول وإعادة التوجيه الآمنة. */
export const ADMIN_LOGIN_PATH = "./login.html";
export const ADMIN_DASHBOARD_PATH = "./index.html";

const ALLOWED_POST_LOGIN = new Set([
  "./index.html",
  "./orders.html",
  "./products.html",
  "./categories.html",
  "./sizes.html",
  "./shipping.html",
  "./users.html",
]);

/**
 * بعد تسجيل الدخول الناجح: يسمح فقط بمسار نسبي `./…html` داخل الإدارة (منع open redirect).
 * يُقبل `#` بسيط فقط (مثل `#add`) دون استعلامات URL.
 */
export function safeRedirectAfterLogin(raw) {
  if (raw == null || String(raw).trim() === "") return ADMIN_DASHBOARD_PATH;
  const s = String(raw).trim();
  if (!s.startsWith("./") || s.includes("://") || s.includes("..") || s.startsWith("//") || s.includes("\\")) {
    return ADMIN_DASHBOARD_PATH;
  }
  if (s.includes("?")) return ADMIN_DASHBOARD_PATH;
  const [pathOnly, frag] = s.split("#");
  if (!ALLOWED_POST_LOGIN.has(pathOnly)) return ADMIN_DASHBOARD_PATH;
  if (pathOnly === ADMIN_LOGIN_PATH) return ADMIN_DASHBOARD_PATH;
  if (frag === undefined || frag === "") return pathOnly;
  if (!/^[a-z0-9_-]+$/i.test(frag)) return pathOnly;
  return `${pathOnly}#${frag}`;
}
