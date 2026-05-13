import { getStorefrontSupabase } from "../lib/supabase/storefrontClient.js";
import { formatPrice, formatPriceAlt } from "./currencyStore.js";
import { escapeHtml, productDetailHref } from "./storefrontCommon.js";
import { categoryStorefrontHref } from "./storefrontPaths.js";

function paramsFromLocation() {
  const q = new URLSearchParams(window.location.search);
  return (q.get("q") || "").trim();
}

function productCard(p, categoryName) {
  const name = escapeHtml(p.name_ar || "");
  const href = escapeHtml(productDetailHref(p.id));
  const cat = categoryName ? `<span class="text-on-surface-variant font-label-sm text-label-sm">${escapeHtml(categoryName)}</span>` : "";
  const img =
    p.image_url && String(p.image_url).trim()
      ? `<img alt="" class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" src="${escapeHtml(String(p.image_url).trim())}" loading="lazy"/>`
      : `<div class="absolute inset-0 bg-gradient-to-br from-[#2a2a2a] to-[#0d0d0d]" aria-hidden="true"></div>`;
  const price = formatPrice(p.price_iqd);
  const priceAlt = formatPriceAlt(p.price_iqd);
  return `<a href="${href}" class="group flex flex-col gap-4 luxury-border luxury-hover rounded overflow-hidden bg-surface-container-low">
<div class="relative aspect-[4/5] overflow-hidden bg-surface-container">${img}</div>
<div class="px-4 pb-4 flex flex-col gap-1">
${cat}
<h3 class="text-on-surface font-headline-sm text-headline-sm leading-snug">${name}</h3>
<span class="text-primary font-label-md text-label-md">${escapeHtml(price)}</span>
<span class="text-on-surface-variant text-label-sm">${escapeHtml(priceAlt)}</span>
</div>
</a>`;
}

async function main() {
  const root = document.getElementById("search-page-root");
  const input = document.getElementById("search-page-input");
  if (!root) return;

  const query = paramsFromLocation();
  if (input instanceof HTMLInputElement) input.value = query;

  if (!query) {
    root.innerHTML =
      '<p class="text-on-surface-variant text-body-md">اكتب كلمة بحث في الأعلى ثم اضغط Enter.</p>';
    return;
  }

  const sb = getStorefrontSupabase();
  if (!sb) {
    root.innerHTML = '<p class="text-error text-body-md">لم يُضبط Supabase في البناء.</p>';
    return;
  }

  root.innerHTML = '<p class="text-on-surface-variant text-body-md">جاري البحث…</p>';

  const pattern = `%${query.replace(/[%_\\]/g, "")}%`;
  const { data: products, error } = await sb
    .from("products")
    .select("id,name_ar,name_en,price_iqd,image_url,sku,category_id")
    .eq("is_active", 1)
    .or(`name_ar.ilike.${pattern},name_en.ilike.${pattern},sku.ilike.${pattern}`)
    .order("id", { ascending: false })
    .limit(48);

  if (error) {
    root.innerHTML = `<p class="text-error text-body-md">${escapeHtml(error.message)}</p>`;
    return;
  }

  const list = products || [];
  const title = `نتائج البحث عن «${escapeHtml(query)}» (${list.length})`;

  if (!list.length) {
    root.innerHTML = `
      <h2 class="text-headline-md font-headline-md text-on-surface mb-4">${title}</h2>
      <p class="text-on-surface-variant text-body-md">لم يُعثر على منتجات. جرّب كلمات أخرى أو <a class="text-primary underline" href="./home.html">تصفح التصنيفات</a>.</p>`;
    return;
  }

  const catIds = [...new Set(list.map((p) => p.category_id).filter(Boolean))];
  const catMap = new Map();
  if (catIds.length) {
    const { data: cats } = await sb.from("categories").select("id,name_ar,slug").in("id", catIds);
    for (const c of cats || []) catMap.set(c.id, c);
  }

  const cards = list
    .map((p) => {
      const cat = p.category_id ? catMap.get(p.category_id) : null;
      const catName = cat?.name_ar || "";
      return productCard(p, catName);
    })
    .join("");

  const catLinks = new Map();
  for (const p of list) {
    const cat = p.category_id ? catMap.get(p.category_id) : null;
    if (cat?.slug) catLinks.set(cat.slug, cat.name_ar || cat.slug);
  }
  const filterCats =
    catLinks.size > 1
      ? `<div class="flex flex-wrap gap-2 mb-8">${[...catLinks.entries()]
          .map(
            ([slug, name]) =>
              `<a href="${escapeHtml(categoryStorefrontHref(slug))}" class="inline-flex px-3 py-1.5 rounded-full border border-outline-variant text-label-sm text-on-surface-variant hover:border-primary hover:text-primary">${escapeHtml(name)}</a>`,
          )
          .join("")}</div>`
      : "";

  root.innerHTML = `
    <h2 class="text-headline-md font-headline-md text-on-surface mb-2">${title}</h2>
    ${filterCats}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter">${cards}</div>
  `;
}

document.addEventListener("DOMContentLoaded", main);
window.addEventListener("aw-prices-refresh", main);
