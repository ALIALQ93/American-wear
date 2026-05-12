/** مفتاح تخزين JWT في المتصفح — يجب أن يطابق السطر في admin/index.html */
export const ADMIN_JWT_KEY = "aw_admin_jwt";

export function hasAdminToken() {
  try {
    return Boolean(sessionStorage.getItem(ADMIN_JWT_KEY)?.length);
  } catch {
    return false;
  }
}

export function getAdminToken() {
  try {
    return sessionStorage.getItem(ADMIN_JWT_KEY) || "";
  } catch {
    return "";
  }
}

export function setAdminToken(token) {
  sessionStorage.setItem(ADMIN_JWT_KEY, token);
}

export function clearAdminSession() {
  sessionStorage.removeItem(ADMIN_JWT_KEY);
}
