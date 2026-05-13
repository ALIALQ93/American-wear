import { getStorefrontSupabase } from "../lib/supabase/storefrontClient.js";
import { categoryStorefrontHref } from "./storefrontPaths.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatIqd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(v)} د.ع`;
}

function paramsFromLocation() {
  const q = new URLSearchParams(window.location.search);
  return {
    categorySlug: (q.get("category") || "").trim().toLowerCase(),
    sectionSlug: (q.get("section") || "").trim().toLowerCase(),
    subsectionSlug: (q.get("subsection") || "").trim().toLowerCase(),
  };
}

function sectionPageHref(categorySlug, sectionSlug, subsectionSlug) {
  const params = new URLSearchParams();
  params.set("category", categorySlug);
  params.set("section", sectionSlug);
  if (subsectionSlug) params.set("subsection", subsectionSlug);
  return `./section.html?${params.toString()}`;
}

function subsectionFilterHtml(categorySlug, sectionSlug, subsections, activeSubSlug) {
  const baseCls =
    "inline-flex items-center px-4 py-2 rounded-full border text-label-sm transition-colors";
  const allActive = !activeSubSlug;
  const allCls = allActive
    ? `${baseCls} bg-primary text-black border-primary`
    : `${baseCls} border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary`;
  const links = [
    `<a href="${escapeHtml(sectionPageHref(categorySlug, sectionSlug, ""))}" class="${allCls}">الكل</a>`,
  ];
  for (const sub of subsections) {
    const slug = String(sub.slug || "").toLowerCase();
    const active = activeSubSlug === slug;
    const cls = active
      ? `${baseCls} bg-primary text-black border-primary`
      : `${baseCls} border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary`;
    links.push(
      `<a href="${escapeHtml(sectionPageHref(categorySlug, sectionSlug, slug))}" class="${cls}">${escapeHtml(sub.name_ar || slug)}</a>`,
    );
  }
  return `<div class="flex flex-wrap gap-2 mt-8" role="navigation" aria-label="تصفية حسب التصنيف الفرعي">${links.join("")}</div>`;
}

function productCard(p) {
  const name = escapeHtml(p.name_ar || "");
  const href = escapeHtml(`./product-detail.html?id=${Number(p.id)}`);
  const img = p.image_url && String(p.image_url).trim()
    ? `<img alt="" class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" src="${escapeHtml(String(p.image_url).trim())}" loading="lazy"/>`
    : `<div class="absolute inset-0 bg-gradient-to-br from-[#2a2a2a] to-[#0d0d0d]" aria-hidden="true"></div>`;
  const price = formatIqd(p.price_iqd);
  return `<a href="${href}" class="group flex flex-col gap-4 luxury-border luxury-hover rounded overflow-hidden bg-surface-container-low">
<div class="relative aspect-[4/5] overflow-hidden bg-surface-container">
${img}
</div>
<div class="px-4 pb-4 flex flex-col gap-1">
<h3 class="text-on-surface font-headline-sm text-headline-sm leading-snug">${name}</h3>
<span class="text-primary font-label-md text-label-md">${escapeHtml(price)}</span>
</div>
</a>`;
}

async function main() {
  const root = document.getElementById("section-dynamic-root");
  const crumbCat = document.getElementById("section-crumb-category");
  const crumbSec = document.getElementById("section-crumb-current");
  if (!root) return;

  const { categorySlug, sectionSlug, subsectionSlug } = paramsFromLocation();
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
  if (subsectionSlug) {
    activeSub = subs.find((s) => String(s.slug).toLowerCase() === subsectionSlug) || null;
  }

  let prodQuery = sb
    .from("products")
    .select("id,name_ar,name_en,price_iqd,image_url,sku,subsection_id")
    .eq("section_id", sec.id)
    .eq("is_active", 1)
    .order("id", { ascending: true });

  if (activeSub) {
    prodQuery = prodQuery.eq("subsection_id", activeSub.id);
  }

  const { data: products, error: pErr } = await prodQuery;

  if (pErr) {
    root.innerHTML = `<p class="text-error text-body-md">${escapeHtml(pErr.message)}</p>`;
    return;
  }

  const list = products || [];
  const title = escapeHtml(sec.name_ar || "");
  const sub =
    sec.name_en && String(sec.name_en).trim()
      ? `<p class="text-on-surface-variant text-label-md mt-2" dir="ltr">${escapeHtml(String(sec.name_en).trim())}</p>`
      : "";
  const secHero =
    sec.image_url && String(sec.image_url).trim()
      ? `<div class="mt-8 max-w-3xl aspect-[21/9] rounded border border-outline-variant overflow-hidden"><img src="${escapeHtml(String(sec.image_url).trim())}" alt="" class="w-full h-full object-cover"/></div>`
      : "";

  const filters =
    subs.length > 0
      ? subsectionFilterHtml(categorySlug, sectionSlug, subs, activeSub ? String(activeSub.slug).toLowerCase() : "")
      : "";

  const productsHeading = activeSub
    ? `المنتجات — ${escapeHtml(activeSub.name_ar || activeSub.slug)}`
    : "المنتجات";

  const unknownFilter =
    subsectionSlug && !activeSub
      ? '<p class="text-on-surface-variant text-label-sm mt-4">التصنيف الفرعي في الرابط غير معروف — عُرضت كل منتجات القسم.</p>'
      : "";

  const grid =
    list.length > 0
      ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter mt-10">${list.map((p) => productCard(p)).join("")}</div>`
      : `<p class="text-on-surface-variant text-body-md mt-8">${activeSub ? "لا توجد منتجات في هذا التصنيف الفرعي بعد." : "لا توجد منتجات ظاهرة في هذا القسم بعد."}</p>`;

  root.innerHTML = `
    <h1 class="text-primary font-display-lg text-display-lg">${title}</h1>
    ${sub}
    ${secHero}
    ${filters}
    ${unknownFilter}
    <h2 class="text-headline-md font-headline-md text-on-surface mt-10">${productsHeading}</h2>
    ${grid}
  `;
}

document.addEventListener("DOMContentLoaded", main);
