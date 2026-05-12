import { getStorefrontSupabase } from "../lib/supabase/storefrontClient.js";

/** روابط الصفحات الثابتة الحالية (slug كما في قاعدة البيانات) */
const SLUG_TO_STATIC_PAGE = {
  shoes: "./category-shoes.html",
  watches: "./category-watches.html",
  perfumes: "./category-perfumes.html",
  menswear: "./category-menswear.html",
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function categoryHref(slug) {
  const s = String(slug || "").trim().toLowerCase();
  return SLUG_TO_STATIC_PAGE[s] || `./category.html?slug=${encodeURIComponent(s)}`;
}

function renderCard(row) {
  const nameAr = escapeHtml(row.name_ar || "");
  const href = escapeHtml(categoryHref(row.slug));
  const imgUrl = row.image_url && String(row.image_url).trim() ? escapeHtml(String(row.image_url).trim()) : "";
  const imgBlock = imgUrl
    ? `<img alt="" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" src="${imgUrl}" loading="lazy"/>`
    : `<div class="absolute inset-0 bg-gradient-to-br from-[#2a2a2a] to-[#0d0d0d]" aria-hidden="true"></div>`;
  return `<a class="group relative aspect-[3/4] overflow-hidden luxury-border luxury-hover block" href="${href}">
${imgBlock}
<div class="absolute inset-0 bg-black/40 flex items-center justify-center">
<h3 class="text-white font-headline-sm text-headline-sm px-4 text-center">${nameAr}</h3>
</div>
</a>`;
}

async function loadCategories() {
  const root = document.getElementById("home-categories-grid");
  const loading = document.getElementById("home-categories-loading");
  if (!root) return;

  const sb = getStorefrontSupabase();
  if (!sb) {
    if (loading) {
      loading.textContent =
        "لم يُضبط Supabase في البناء (VITE_SUPABASE_URL ومفتاح عام). أضف المتغيرات ثم أعد بناء المشروع.";
      loading.classList.remove("hidden");
    }
    return;
  }

  const { data, error } = await sb
    .from("categories")
    .select("id,name_ar,name_en,slug,image_url,sort_order")
    .eq("is_active", 1)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    if (loading) {
      loading.textContent = `تعذر تحميل التصنيفات: ${error.message}`;
      loading.classList.remove("hidden");
    }
    return;
  }

  const rows = data || [];
  if (loading) loading.remove();

  if (!rows.length) {
    root.innerHTML =
      '<p class="col-span-full text-on-surface-variant text-center py-12 text-body-md">لا توجد تصنيفات ظاهرة حالياً. أضف تصنيفاً من لوحة الإدارة وفعّل «ظاهر في المتجر».</p>';
    return;
  }

  root.innerHTML = rows.map((r) => renderCard(r)).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  loadCategories();
});
