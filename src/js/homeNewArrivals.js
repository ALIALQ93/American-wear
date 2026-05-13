import { getStorefrontSupabase } from "../lib/supabase/storefrontClient.js";
import { formatPrice, formatPriceAlt } from "./currencyStore.js";
import { escapeHtml, productDetailHref } from "./storefrontCommon.js";

function productCard(p) {
  const name = escapeHtml(p.name_ar || "");
  const href = escapeHtml(productDetailHref(p.id));
  const img =
    p.image_url && String(p.image_url).trim()
      ? `<img alt="" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" src="${escapeHtml(String(p.image_url).trim())}" loading="lazy"/>`
      : `<div class="w-full h-full bg-gradient-to-br from-[#2a2a2a] to-[#0d0d0d]" aria-hidden="true"></div>`;
  const price = formatPrice(p.price_iqd);
  const priceAlt = formatPriceAlt(p.price_iqd);
  return `<a href="${href}" class="group flex flex-col gap-6 luxury-border luxury-hover overflow-hidden bg-surface-container-low rounded">
<div class="relative aspect-[4/5] bg-surface-container overflow-hidden">
${img}
<span class="absolute bottom-0 left-0 right-0 bg-primary text-on-primary py-4 font-label-md text-label-md text-center transform translate-y-full group-hover:translate-y-0 transition-transform duration-300">عرض المنتج</span>
</div>
<div class="flex justify-between items-start px-1 pb-2">
<div class="flex flex-col gap-1 min-w-0">
<h4 class="text-on-surface font-headline-sm text-headline-sm truncate">${name}</h4>
<span class="text-on-surface-variant text-label-sm">${escapeHtml(priceAlt)}</span>
</div>
<span class="text-primary font-label-md text-label-md shrink-0">${escapeHtml(price)}</span>
</div>
</a>`;
}

async function loadNewArrivals() {
  const root = document.getElementById("home-new-arrivals-grid");
  const loading = document.getElementById("home-new-arrivals-loading");
  if (!root) return;

  const sb = getStorefrontSupabase();
  if (!sb) {
    if (loading) loading.textContent = "لم يُضبط Supabase — لا يمكن تحميل المنتجات.";
    return;
  }

  const { data, error } = await sb
    .from("products")
    .select("id,name_ar,price_iqd,image_url")
    .eq("is_active", 1)
    .order("id", { ascending: false })
    .limit(6);

  if (error) {
    if (loading) loading.textContent = `تعذر تحميل المنتجات: ${error.message}`;
    return;
  }

  if (loading) loading.remove();
  const rows = data || [];
  if (!rows.length) {
    root.innerHTML =
      '<p class="col-span-full text-on-surface-variant text-center py-12 text-body-md">لا توجد منتجات ظاهرة بعد.</p>';
    return;
  }

  root.innerHTML = rows.map((p) => productCard(p)).join("");
}

document.addEventListener("DOMContentLoaded", loadNewArrivals);
window.addEventListener("aw-prices-refresh", loadNewArrivals);
