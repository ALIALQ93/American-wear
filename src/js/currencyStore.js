const CURRENCY_KEY = "aw_display_currency";
const RATE_KEY = "aw_usd_iqd_rate";

let usdIqdRate = 1310;
let displayCurrency = "IQD";

function readStoredCurrency() {
  const c = localStorage.getItem(CURRENCY_KEY);
  return c === "USD" ? "USD" : "IQD";
}

export function getDisplayCurrency() {
  return displayCurrency;
}

export function getUsdIqdRate() {
  return usdIqdRate;
}

export function iqdToUsd(iqd) {
  const rate = usdIqdRate > 0 ? usdIqdRate : 1310;
  return Math.round((Number(iqd) / rate) * 100) / 100;
}

export function formatIqdOnly(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(v)} د.ع`;
}

export function formatUsdOnly(n) {
  const v = iqdToUsd(n);
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
}

/** سعر للعرض حسب عملة الزبون */
export function formatPrice(iqd) {
  return displayCurrency === "USD" ? formatUsdOnly(iqd) : formatIqdOnly(iqd);
}

/** سطر ثانوي بالعملة الأخرى */
export function formatPriceAlt(iqd) {
  return displayCurrency === "USD" ? formatIqdOnly(iqd) : formatUsdOnly(iqd);
}

export function formatPriceBlock(iqd) {
  const main = formatPrice(iqd);
  const alt = formatPriceAlt(iqd);
  return { main, alt };
}

export function toggleDisplayCurrency() {
  displayCurrency = displayCurrency === "IQD" ? "USD" : "IQD";
  localStorage.setItem(CURRENCY_KEY, displayCurrency);
  window.dispatchEvent(new CustomEvent("aw-currency-updated"));
  return displayCurrency;
}

export function currencyToggleLabel() {
  return displayCurrency === "IQD" ? "USD" : "IQD";
}

export async function loadCurrencySettings(sb) {
  displayCurrency = readStoredCurrency();
  const cached = Number(localStorage.getItem(RATE_KEY));
  if (Number.isFinite(cached) && cached > 0) usdIqdRate = cached;
  if (!sb) return usdIqdRate;
  const { data, error } = await sb.from("store_settings").select("value").eq("key", "usd_iqd_rate").maybeSingle();
  if (!error && data?.value) {
    const r = Number(data.value);
    if (Number.isFinite(r) && r > 0) {
      usdIqdRate = r;
      localStorage.setItem(RATE_KEY, String(r));
    }
  }
  return usdIqdRate;
}

export async function fetchStorefrontPaymentMethods(sb) {
  if (!sb) return [];
  const { data, error } = await sb
    .from("payment_methods")
    .select("id,name_ar,description_ar,sort_order")
    .eq("is_active", 1)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) return [];
  return (data || []).map((r) => ({
    id: Number(r.id),
    nameAr: r.name_ar || "",
    descriptionAr: r.description_ar || null,
  }));
}
