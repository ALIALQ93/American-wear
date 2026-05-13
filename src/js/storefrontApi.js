/** طلبات REST للمتجر (حساب الزبون عبر خادم Node — ليس Supabase Auth) */
export function storefrontApiUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const origin = (import.meta.env.VITE_API_ORIGIN ?? "").trim().replace(/\/$/, "");
  if (origin) return `${origin}${normalized}`;
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  if (!base) return normalized;
  return `${base}${normalized}`;
}

export async function storefrontFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(storefrontApiUrl(path), {
    ...options,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    const raw = data?.error || text || res.statusText || "طلب فاشل";
    const err = new Error(
      typeof raw === "string" && raw.includes("<html")
        ? "الخادم لا يقبل هذا الطلب (405) — تأكد من تشغيل API أو نشر هجرة Supabase"
        : raw,
    );
    err.code = data?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}
