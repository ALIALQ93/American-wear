export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatIqd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(v)} د.ع`;
}

export function productDetailHref(productId) {
  return `./product-detail.html?id=${encodeURIComponent(String(productId))}`;
}

export function parsePositiveInt(raw) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
