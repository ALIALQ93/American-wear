import { getAdminToken } from "./session.js";
import {
  isSupabaseAuthConfigured,
  syncAdminTokenFromSupabaseSession,
  clearAdminSessionAndSupabase,
} from "./supabaseAuth.js";
import { fetchShippingGovernorates, updateShippingGovernorate } from "./adminSupabaseData.js";

/** @typedef {{ id: number, nameAr: string, nameEn?: string|null, slug: string, feeIqd: number, isMajor: boolean, sortOrder: number, isActive: number|boolean }} GovRow */

/** @type {GovRow[]} */
let rows = [];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(n) {
  return new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(Number(n) || 0);
}

function isActiveVal(v) {
  return v === 1 || v === true;
}

function render() {
  const root = document.getElementById("shipping-root");
  if (!root) return;
  if (!rows.length) {
    root.innerHTML = `<p class="text-on-surface-variant text-center py-12">لا توجد محافظات — نفّذ هجرة 20260526120000.</p>`;
    return;
  }
  const major = rows.filter((r) => r.isMajor);
  const other = rows.filter((r) => !r.isMajor);
  const section = (title, list) => `
    <section class="mb-10 border border-outline-variant rounded-lg overflow-hidden bg-surface-container-low">
      <h3 class="px-6 py-4 bg-surface-container-high text-headline-sm font-headline-sm text-primary border-b border-outline-variant">${escapeHtml(title)}</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-right min-w-[560px]">
          <thead>
            <tr class="text-label-md text-primary border-b border-outline-variant bg-surface-container-lowest/80">
              <th class="px-6 py-3">المحافظة</th>
              <th class="px-6 py-3">أجرة الشحن (د.ع)</th>
              <th class="px-6 py-3">الظهور</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/40">
            ${list.map(rowHtml).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
  root.innerHTML = section("مدن ومحافظات رئيسية", major) + section("باقي المحافظات", other);
  bindHandlers();
}

/** @param {GovRow} r */
function rowHtml(r) {
  const active = isActiveVal(r.isActive);
  return `
    <tr class="hover:bg-surface-container-highest/40" data-gov-id="${r.id}">
      <td class="px-6 py-3">
        <p class="font-body-md text-on-surface">${escapeHtml(r.nameAr)}</p>
        ${r.nameEn ? `<p class="text-label-sm text-on-surface-variant" dir="ltr">${escapeHtml(r.nameEn)}</p>` : ""}
      </td>
      <td class="px-6 py-3">
        <input type="number" min="0" step="500" data-fee-id="${r.id}" value="${Number(r.feeIqd) || 0}" class="w-36 bg-surface-container border border-outline-variant px-3 py-2 text-on-surface focus:border-primary outline-none text-left"/>
      </td>
      <td class="px-6 py-3">
        <label class="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" class="rounded border-outline-variant text-primary js-gov-active" data-id="${r.id}" ${active ? "checked" : ""}/>
          <span class="text-label-sm text-on-surface-variant js-gov-active-label">${active ? "ظاهرة" : "مخفية"}</span>
        </label>
      </td>
    </tr>`;
}

function bindHandlers() {
  document.querySelectorAll("[data-fee-id]").forEach((el) => {
    el.addEventListener("change", async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      const id = Number(t.getAttribute("data-fee-id"));
      const feeIqd = Math.max(0, Math.floor(Number(t.value) || 0));
      try {
        await updateShippingGovernorate(id, { feeIqd });
        const r = rows.find((x) => x.id === id);
        if (r) r.feeIqd = feeIqd;
        t.value = String(feeIqd);
      } catch (err) {
        const r = rows.find((x) => x.id === id);
        if (r) t.value = String(r.feeIqd);
        alert(err instanceof Error ? err.message : "تعذر الحفظ");
      }
    });
  });
  document.querySelectorAll(".js-gov-active").forEach((el) => {
    el.addEventListener("change", async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      const id = Number(t.dataset.id);
      const on = t.checked;
      const label = t.closest("label")?.querySelector(".js-gov-active-label");
      try {
        await updateShippingGovernorate(id, { isActive: on });
        const r = rows.find((x) => x.id === id);
        if (r) r.isActive = on ? 1 : 0;
        if (label) label.textContent = on ? "ظاهرة" : "مخفية";
      } catch {
        t.checked = !on;
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (isSupabaseAuthConfigured()) {
    await syncAdminTokenFromSupabaseSession();
  }
  document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
  });
  if (!getAdminToken()) return;
  try {
    const data = await fetchShippingGovernorates();
    if (data) {
      rows = data;
      render();
    }
  } catch {
    const root = document.getElementById("shipping-root");
    if (root) {
      root.innerHTML = `<p class="text-error text-center py-12">تعذر التحميل — نفّذ npm run db:push للهجرة 20260526120000.</p>`;
    }
  }
});
