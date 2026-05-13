import { getStorefrontSupabase } from "../lib/supabase/storefrontClient.js";
import { categoryStorefrontHref, sectionStorefrontHref } from "./storefrontPaths.js";
import { formatPrice, formatPriceAlt } from "./currencyStore.js";
import { escapeHtml, productDetailHref } from "./storefrontCommon.js";

function paramsFromLocation() {
  const q = new URLSearchParams(window.location.search);
  return {
    categorySlug: (q.get("category") || "").trim().toLowerCase(),
    sectionSlug: (q.get("section") || "").trim().toLowerCase(),
    subsectionSlug: (q.get("subsection") || "").trim().toLowerCase(),
    size: (q.get("size") || "").trim(),
    color: (q.get("color") || "").trim(),
    sort: (q.get("sort") || "newest").trim().toLowerCase(),
    min: q.get("min") ? Number(q.get("min")) : null,
    max: q.get("max") ? Number(q.get("max")) : null,
  };
}

function sectionPageHref(categorySlug, sectionSlug, opts = {}) {
  return sectionStorefrontHref(categorySlug, sectionSlug, {
    subsection: opts.subsectionSlug || "",
    size: opts.size || "",
    color: opts.color || "",
    sort: opts.sort && opts.sort !== "newest" ? opts.sort : "",
    min: opts.min != null && Number.isFinite(opts.min) ? String(Math.round(opts.min)) : "",
    max: opts.max != null && Number.isFinite(opts.max) ? String(Math.round(opts.max)) : "",
  });
}

function pillHref(categorySlug, sectionSlug, current, patch) {
  return sectionPageHref(categorySlug, sectionSlug, { ...current, ...patch });
}

function subsectionFilterHtml(categorySlug, sectionSlug, subsections, current) {
  const baseCls =
    "inline-flex items-center px-4 py-2 rounded-full border text-label-sm transition-colors";
  const allActive = !current.subsectionSlug;
  const allCls = allActive
    ? `${baseCls} bg-primary text-black border-primary`
    : `${baseCls} border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary`;
  const links = [
    `<a href="${escapeHtml(pillHref(categorySlug, sectionSlug, current, { subsectionSlug: "" }))}" class="${allCls}">الكل</a>`,
  ];
  for (const sub of subsections) {
    const slug = String(sub.slug || "").toLowerCase();
    const active = current.subsectionSlug === slug;
    const cls = active
      ? `${baseCls} bg-primary text-black border-primary`
      : `${baseCls} border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary`;
    links.push(
      `<a href="${escapeHtml(pillHref(categorySlug, sectionSlug, current, { subsectionSlug: slug }))}" class="${cls}">${escapeHtml(sub.name_ar || slug)}</a>`,
    );
  }
  return links.join("");
}

function variantFilterHtml(categorySlug, sectionSlug, current, sizes, colors) {
  const parts = [];
  if (sizes.length) {
    const sizeLinks = sizes
      .map((s) => {
        const active = current.size === s;
        const cls = active
          ? "px-3 py-1.5 rounded-full border text-label-sm bg-primary text-black border-primary"
          : "px-3 py-1.5 rounded-full border text-label-sm border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary";
        const href = pillHref(categorySlug, sectionSlug, current, { size: active ? "" : s });
        return `<a href="${escapeHtml(href)}" class="${cls}">${escapeHtml(s)}</a>`;
      })
      .join("");
    parts.push(
      `<div class="flex flex-wrap items-center gap-2"><span class="text-label-sm text-on-surface-variant ml-2">المقاس:</span>${sizeLinks}</div>`,
    );
  }
  if (colors.length) {
    const colorLinks = colors
      .map((c) => {
        const id = String(c.id);
        const active = current.color === id;
        const cls = active
          ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-label-sm bg-primary text-black border-primary"
          : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-label-sm border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary";
        const swatch = c.hex_code
          ? `<span class="w-3 h-3 rounded-full border border-outline-variant" style="background:${escapeHtml(c.hex_code)}"></span>`
          : "";
        const href = pillHref(categorySlug, sectionSlug, current, { color: active ? "" : id });
        return `<a href="${escapeHtml(href)}" class="${cls}">${swatch}${escapeHtml(c.name_ar || id)}</a>`;
      })
      .join("");
    parts.push(
      `<div class="flex flex-wrap items-center gap-2"><span class="text-label-sm text-on-surface-variant ml-2">اللون:</span>${colorLinks}</div>`,
    );
  }
  return parts.join("");
}

function sortSelectHtml(categorySlug, sectionSlug, current) {
  const sorts = [
    { v: "newest", label: "الأحدث" },
    { v: "price_asc", label: "السعر: الأقل" },
    { v: "price_desc", label: "السعر: الأعلى" },
    { v: "name", label: "الاسم" },
  ];
  const options = sorts
    .map((s) => `<option value="${s.v}"${current.sort === s.v ? " selected" : ""}>${s.label}</option>`)
    .join("");
  return `<label class="flex items-center gap-2 text-label-sm text-on-surface-variant">
<span>ترتيب:</span>
<select id="section-sort-select" class="bg-surface-container border border-outline-variant rounded px-3 py-1.5 text-on-surface text-label-sm">${options}</select>
</label>`;
}

function productCard(p) {
  const name = escapeHtml(p.name_ar || "");
  const href = escapeHtml(productDetailHref(p.id));
  const img =
    p.image_url && String(p.image_url).trim()
      ? `<img alt="" class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" src="${escapeHtml(String(p.image_url).trim())}" loading="lazy"/>`
      : `<div class="absolute inset-0 bg-gradient-to-br from-[#2a2a2a] to-[#0d0d0d]" aria-hidden="true"></div>`;
  const price = formatPrice(p.price_iqd);
  const priceAlt = formatPriceAlt(p.price_iqd);
  return `<a href="${href}" class="group flex flex-col gap-4 luxury-border luxury-hover rounded overflow-hidden bg-surface-container-low">
<div class="relative aspect-[4/5] overflow-hidden bg-surface-container">${img}</div>
<div class="px-4 pb-4 flex flex-col gap-1">
<h3 class="text-on-surface font-headline-sm text-headline-sm leading-snug">${name}</h3>
<span class="text-primary font-label-md text-label-md">${escapeHtml(price)}</span>
<span class="text-on-surface-variant text-label-sm">${escapeHtml(priceAlt)}</span>
</div>
</a>`;
}

function sortProducts(list, sort) {
  const rows = [...list];
  if (sort === "price_asc") rows.sort((a, b) => Number(a.price_iqd) - Number(b.price_iqd));
  else if (sort === "price_desc") rows.sort((a, b) => Number(b.price_iqd) - Number(a.price_iqd));
  else if (sort === "name") rows.sort((a, b) => String(a.name_ar || "").localeCompare(String(b.name_ar || ""), "ar"));
  else rows.sort((a, b) => Number(b.id) - Number(a.id));
  return rows;
}

function productMatchesFilters(productId, variantIndex, current) {
  const variants = variantIndex.get(productId) || [];
  if (!variants.length) {
    if (current.size || current.color) return false;
    return true;
  }
  return variants.some((v) => {
    if (current.size && v.size_label !== current.size) return false;
    if (current.color && String(v.color_id || "") !== current.color) return false;
    if (v.stock <= 0 && (current.size || current.color)) return false;
    return true;
  });
}

async function main() {
  const root = document.getElementById("section-dynamic-root");
  const crumbCat = document.getElementById("section-crumb-category");
  const crumbSec = document.getElementById("section-crumb-current");
  if (!root) return;

  const current = paramsFromLocation();
  const { categorySlug, sectionSlug } = current;
  if (!categorySlug || !sectionSlug) {
    root.innerHTML =
      '<p class="text-on-surface-variant text-body-md">رابط غير مكتمل. استخدم الرابط من صفحة التصنيف أو <a class="text-primary underline" href="./home.html">الرئيسية</a>.</p>';
    if (crumbSec) crumbSec.textContent = "—";
    return;
  }

  const sb = getStorefrontSupabase();
  if (!sb) {
    root.innerHTML =
      '<p class="text-error text-body-md">لم يُضبط Supabase في البناء. راجع ملف SUPABASE.md.</p>';
    return;
  }

  const { data: cat, error: cErr } = await sb
    .from("categories")
    .select("id,name_ar,slug")
    .eq("slug", categorySlug)
    .eq("is_active", 1)
    .maybeSingle();

  if (cErr) {
    root.innerHTML = `<p class="text-error text-body-md">${escapeHtml(cErr.message)}</p>`;
    return;
  }
  if (!cat) {
    root.innerHTML =
      '<p class="text-on-surface-variant text-body-md">التصنيف غير موجود أو غير ظاهر.</p>';
    return;
  }

  if (crumbCat) {
    crumbCat.textContent = cat.name_ar || categorySlug;
    crumbCat.setAttribute("href", categoryStorefrontHref(cat.slug));
  }

  const { data: sec, error: sErr } = await sb
    .from("category_sections")
    .select("id,name_ar,name_en,slug,image_url")
    .eq("category_id", cat.id)
    .eq("slug", sectionSlug)
    .eq("is_active", 1)
    .maybeSingle();

  if (sErr) {
    root.innerHTML = `<p class="text-error text-body-md">${escapeHtml(sErr.message)}</p>`;
    return;
  }
  if (!sec) {
    root.innerHTML =
      '<p class="text-on-surface-variant text-body-md">القسم غير موجود أو غير ظاهر ضمن هذا التصنيف.</p>';
    if (crumbSec) crumbSec.textContent = "—";
    return;
  }

  if (crumbSec) crumbSec.textContent = sec.name_ar || sectionSlug;

  const { data: subsections, error: subErr } = await sb
    .from("category_subsections")
    .select("id,name_ar,slug")
    .eq("section_id", sec.id)
    .eq("is_active", 1)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (subErr) {
    root.innerHTML = `<p class="text-error text-body-md">${escapeHtml(subErr.message)}</p>`;
    return;
  }

  const subs = subsections || [];
  let activeSub = null;
  if (current.subsectionSlug) {
    activeSub = subs.find((s) => String(s.slug).toLowerCase() === current.subsectionSlug) || null;
  }

  let prodQuery = sb
    .from("products")
    .select("id,name_ar,name_en,price_iqd,image_url,sku,subsection_id")
    .eq("section_id", sec.id)
    .eq("is_active", 1);

  if (activeSub) prodQuery = prodQuery.eq("subsection_id", activeSub.id);

  const { data: products, error: pErr } = await prodQuery;

  if (pErr) {
    root.innerHTML = `<p class="text-error text-body-md">${escapeHtml(pErr.message)}</p>`;
    return;
  }

  const allProducts = products || [];
  const productIds = allProducts.map((p) => p.id);

  const variantIndex = new Map();
  const sizeSet = new Set();
  const colorMap = new Map();

  if (productIds.length) {
    const { data: variants } = await sb
      .from("product_variants")
      .select("product_id,size_label,stock,color_id,product_colors(id,name_ar,hex_code)")
      .in("product_id", productIds)
      .eq("is_active", 1);

    for (const v of variants || []) {
      const pid = v.product_id;
      if (!variantIndex.has(pid)) variantIndex.set(pid, []);
      variantIndex.get(pid).push(v);
      if (v.size_label) sizeSet.add(String(v.size_label));
      const col = v.product_colors;
      if (col?.id) colorMap.set(col.id, col);
    }
  }

  const sizes = [...sizeSet].sort((a, b) => a.localeCompare(b, "ar"));
  const colors = [...colorMap.values()].sort((a, b) =>
    String(a.name_ar || "").localeCompare(String(b.name_ar || ""), "ar"),
  );

  let filtered = allProducts.filter((p) => {
    if (current.min != null && Number.isFinite(current.min) && Number(p.price_iqd) < current.min) return false;
    if (current.max != null && Number.isFinite(current.max) && Number(p.price_iqd) > current.max) return false;
    return productMatchesFilters(p.id, variantIndex, current);
  });

  filtered = sortProducts(filtered, current.sort);

  const title = escapeHtml(sec.name_ar || "");
  const sub =
    sec.name_en && String(sec.name_en).trim()
      ? `<p class="text-on-surface-variant text-label-md mt-2" dir="ltr">${escapeHtml(String(sec.name_en).trim())}</p>`
      : "";
  const secHero =
    sec.image_url && String(sec.image_url).trim()
      ? `<div class="mt-8 max-w-3xl aspect-[21/9] rounded border border-outline-variant overflow-hidden"><img src="${escapeHtml(String(sec.image_url).trim())}" alt="" class="w-full h-full object-cover"/></div>`
      : "";

  const subsectionFilters =
    subs.length > 0
      ? `<div class="flex flex-wrap gap-2 mt-8" role="navigation" aria-label="تصفية حسب التصنيف الفرعي">${subsectionFilterHtml(categorySlug, sectionSlug, subs, current)}</div>`
      : "";

  const variantFilters =
    sizes.length || colors.length
      ? `<div class="flex flex-col gap-4 mt-6 p-4 rounded border border-outline-variant bg-surface-container-low">${variantFilterHtml(categorySlug, sectionSlug, current, sizes, colors)}</div>`
      : "";

  const sortBar = `<div class="flex flex-wrap items-center justify-between gap-4 mt-8">${sortSelectHtml(categorySlug, sectionSlug, current)}</div>`;

  const productsHeading = activeSub
    ? `المنتجات — ${escapeHtml(activeSub.name_ar || activeSub.slug)}`
    : "المنتجات";

  const unknownFilter =
    current.subsectionSlug && !activeSub
      ? '<p class="text-on-surface-variant text-label-sm mt-4">التصنيف الفرعي في الرابط غير معروف — عُرضت كل منتجات القسم.</p>'
      : "";

  const activeFilters =
    current.size || current.color
      ? `<p class="text-label-sm text-on-surface-variant mt-4"><a class="text-primary underline" href="${escapeHtml(sectionPageHref(categorySlug, sectionSlug, { ...current, size: "", color: "" }))}">مسح فلاتر المقاس/اللون</a></p>`
      : "";

  const grid =
    filtered.length > 0
      ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter mt-10">${filtered.map((p) => productCard(p)).join("")}</div>`
      : `<p class="text-on-surface-variant text-body-md mt-8">لا توجد منتجات تطابق الفلاتر الحالية.</p>`;

  root.innerHTML = `
    <h1 class="text-primary font-display-lg text-display-lg">${title}</h1>
    ${sub}
    ${secHero}
    ${subsectionFilters}
    ${variantFilters}
    ${sortBar}
    ${unknownFilter}
    ${activeFilters}
    <h2 class="text-headline-md font-headline-md text-on-surface mt-10">${productsHeading} <span class="text-on-surface-variant text-label-md">(${filtered.length})</span></h2>
    ${grid}
  `;

  const sortEl = document.getElementById("section-sort-select");
  if (sortEl instanceof HTMLSelectElement) {
    sortEl.addEventListener("change", () => {
      window.location.href = pillHref(categorySlug, sectionSlug, current, { sort: sortEl.value });
    });
  }
}

document.addEventListener("DOMContentLoaded", main);
window.addEventListener("aw-prices-refresh", () => {
  const root = document.getElementById("section-dynamic-root");
  if (root && root.querySelector(".grid")) main();
});
