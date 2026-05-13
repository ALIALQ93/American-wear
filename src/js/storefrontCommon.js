import { productStorefrontHref } from "./storefrontPaths.js";

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

export function isSafeStorefrontPath(path) {
  const s = String(path || "").trim();
  if (!s.startsWith("./") || s.includes("://") || s.includes("..") || s.includes("\\")) return false;
  return /\.html(?:[#?]|$)/i.test(s);
}

/** مسار الصفحة الحالية نسبياً (للعودة بعد إضافة السلة). */
export function currentStorefrontReturn() {
  if (typeof location === "undefined") return "./home.html";
  const page = location.pathname.split("/").filter(Boolean).pop() || "home.html";
  return `./${page}${location.search}${location.hash}`;
}

export function productDetailHref(productId, returnTo) {
  const base = productStorefrontHref(productId);
  const ret =
    returnTo != null && String(returnTo).trim() !== ""
      ? String(returnTo).trim()
      : typeof location !== "undefined"
        ? currentStorefrontReturn()
        : "";
  if (!isSafeStorefrontPath(ret)) return base;
  return `${base}&return=${encodeURIComponent(ret)}`;
}

export function parsePositiveInt(raw) {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
