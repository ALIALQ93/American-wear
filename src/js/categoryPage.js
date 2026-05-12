import { getStorefrontSupabase } from "../lib/supabase/storefrontClient.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugFromLocation() {
  const q = new URLSearchParams(window.location.search).get("slug");
  return q ? String(q).trim().toLowerCase() : "";
}

async function main() {
  const root = document.getElementById("category-dynamic-root");
  if (!root) return;

  const slug = slugFromLocation();
  if (!slug) {
    root.innerHTML =
      '<p class="text-on-surface-variant text-body-md">لم يُحدد تصنيف. ارجع إلى <a class="text-primary underline" href="./home.html">الرئيسية</a>.</p>';
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
    .select("id,name_ar,name_en,slug,description_ar,image_url")
    .eq("slug", slug)
    .eq("is_active", 1)
    .maybeSingle();

  if (cErr) {
    root.innerHTML = `<p class="text-error text-body-md">${escapeHtml(cErr.message)}</p>`;
    return;
  }
  if (!cat) {
    root.innerHTML =
      '<p class="text-on-surface-variant text-body-md">التصنيف غير موجود أو غير ظاهر في المتجر.</p>';
    return;
  }

  const { data: secs, error: sErr } = await sb
    .from("category_sections")
    .select("id,name_ar,name_en,slug,sort_order")
    .eq("category_id", cat.id)
    .eq("is_active", 1)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (sErr) {
    root.innerHTML = `<p class="text-error text-body-md">${escapeHtml(sErr.message)}</p>`;
    return;
  }

  const title = escapeHtml(cat.name_ar || "");
  const desc = cat.description_ar ? `<p class="text-on-surface-variant text-body-md max-w-2xl mt-4 leading-relaxed">${escapeHtml(cat.description_ar)}</p>` : "";
  const hero = cat.image_url
    ? `<div class="mt-8 max-w-3xl aspect-[21/9] rounded border border-outline-variant overflow-hidden"><img src="${escapeHtml(String(cat.image_url))}" alt="" class="w-full h-full object-cover"/></div>`
    : "";

  const sectionList = (secs || []).length
    ? `<ul class="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        ${(secs || [])
          .map(
            (s) =>
              `<li class="border border-outline-variant rounded px-4 py-3 bg-surface-container-low">
                <span class="text-on-surface font-headline-sm text-headline-sm">${escapeHtml(s.name_ar)}</span>
                ${s.name_en ? `<span class="block text-label-sm text-on-surface-variant mt-1" dir="ltr">${escapeHtml(s.name_en)}</span>` : ""}
              </li>`,
          )
          .join("")}
       </ul>`
    : '<p class="text-on-surface-variant text-body-md mt-8">لا توجد أقسام فرعية ظاهرة تحت هذا التصنيف بعد.</p>';

  root.innerHTML = `
    <h1 class="text-primary font-display-lg text-display-lg">${title}</h1>
    ${desc}
    ${hero}
    <h2 class="text-headline-md font-headline-md text-on-surface mt-12 mb-2">الأقسام</h2>
    ${sectionList}
  `;

  const crumb = document.getElementById("category-crumb-current");
  if (crumb) crumb.textContent = cat.name_ar || slug;
}

document.addEventListener("DOMContentLoaded", main);
