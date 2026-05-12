import { getAdminToken } from "./session.js";
import {
  isSupabaseAuthConfigured,
  syncAdminTokenFromSupabaseSession,
  clearAdminSessionAndSupabase,
} from "./supabaseAuth.js";
import { fetchSizesList } from "./adminSupabaseData.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @type {{ category: string, label: string, isActive: number|boolean, sortOrder: number }[]} */
let rows = [];

function groupByCategory(list) {
  const map = new Map();
  for (const r of list) {
    const cat = r.category || "—";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(r);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  }
  return Array.from(map.entries()).sort(([a], [b]) => String(a).localeCompare(String(b), "ar"));
}

function render() {
  const root = document.getElementById("sizes-root");
  if (!root) return;
  if (!rows.length) {
    root.innerHTML = `<p class="text-on-surface-variant text-center py-12">لا توجد قوالب مقاسات في قاعدة البيانات</p>`;
    return;
  }
  const groups = groupByCategory(rows);
  root.innerHTML = groups
    .map(
      ([cat, items]) => `
    <section class="mb-10 border border-outline-variant rounded-lg overflow-hidden bg-surface-container-low">
      <h3 class="px-6 py-4 bg-surface-container-high text-headline-sm font-headline-sm text-primary border-b border-outline-variant">${escapeHtml(cat)}</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-right min-w-[400px]">
          <thead>
            <tr class="text-label-md text-primary border-b border-outline-variant bg-surface-container-lowest/80">
              <th class="px-6 py-3">المقاس / التسمية</th>
              <th class="px-6 py-3">الترتيب</th>
              <th class="px-6 py-3">الحالة</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/40">
            ${items
              .map(
                (r) => `
              <tr class="hover:bg-surface-container-highest/40">
                <td class="px-6 py-3 text-on-surface font-body-md">${escapeHtml(r.label)}</td>
                <td class="px-6 py-3 text-on-surface-variant">${escapeHtml(String(r.sortOrder ?? ""))}</td>
                <td class="px-6 py-3">${r.isActive === 1 || r.isActive === true ? '<span class="text-primary text-label-sm">نشط</span>' : '<span class="text-on-surface-variant text-label-sm">معطّل</span>'}</td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>`,
    )
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  if (isSupabaseAuthConfigured()) {
    await syncAdminTokenFromSupabaseSession();
  }

  document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
  });

  const token = getAdminToken();
  if (!token) return;

  try {
    const data = await fetchSizesList(null);
    if (data) {
      rows = data;
      render();
    }
  } catch (e) {
    console.error(e);
    const root = document.getElementById("sizes-root");
    if (root) {
      root.innerHTML = `<p class="text-error text-center py-12">تعذر تحميل المقاسات من Supabase.</p>`;
    }
  }
});
