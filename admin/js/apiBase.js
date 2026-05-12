/**
 * عنوان طلبات REST للإدارة: يدعم `import.meta.env.BASE_URL` (GitHub Pages تحت مسار فرعي)
 * و`VITE_API_ORIGIN` عند استضافة الـ API على نطاق/منفذ آخر.
 */
export function apiUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const origin = (import.meta.env.VITE_API_ORIGIN ?? "").trim().replace(/\/$/, "");
  if (origin) return `${origin}${normalized}`;
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  if (!base) return normalized;
  return `${base}${normalized}`;
}
