import { getAdminToken } from "./session.js";
import {
  isSupabaseAuthConfigured,
  syncAdminTokenFromSupabaseSession,
  clearAdminSessionAndSupabase,
} from "./supabaseAuth.js";
import {
  createPaymentMethod,
  deletePaymentMethod,
  fetchPaymentMethods,
  fetchUsdIqdRate,
  updatePaymentMethod,
  updateUsdIqdRate,
} from "./adminSupabaseData.js";

/** @typedef {{ id: number, nameAr: string, nameEn?: string|null, slug: string, descriptionAr?: string|null, sortOrder: number, isActive: number|boolean }} PayRow */

/** @type {PayRow[]} */
let rows = [];
let usdRate = 1310;

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

function suggestSlug(text) {
  const base = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "payment";
}

function renderRateCard() {
  return `
    <section class="mb-10 border border-primary/40 rounded-lg overflow-hidden bg-surface-container-low">
      <div class="px-6 py-4 border-b border-outline-variant bg-surface-container-high/50">
        <h3 class="text-headline-sm font-headline-sm text-primary">سعر صرف الدولار</h3>
        <p class="text-label-sm text-on-surface-variant mt-1">يُستخدم لعرض الأسعار بالدولار في المتجر (الأسعار تُخزَّن بالدينار).</p>
      </div>
      <div class="px-6 py-5 flex flex-wrap items-end gap-4">
        <div>
          <label class="block text-label-sm text-on-surface-variant mb-1">١ دولار = … دينار عراقي</label>
          <input id="usd-iqd-rate" type="number" min="1" step="1" value="${usdRate}" class="w-40 bg-surface-container border border-outline-variant px-3 py-2 text-on-surface focus:border-primary outline-none text-left"/>
        </div>
        <button type="button" id="save-usd-rate" class="bg-primary text-on-primary font-label-md px-5 py-2.5 hover:bg-primary-container transition-colors">حفظ سعر الصرف</button>
        <p id="rate-msg" class="text-label-sm text-on-surface-variant hidden"></p>
        <p class="text-label-sm text-on-surface-variant w-full">مثال: منتج بسعر ١٣١٬٠٠٠ د.ع ≈ <span class="text-primary">$100</span> عند سعر ١٣١٠.</p>
      </div>
    </section>`;
}

function renderMethods() {
  const root = document.getElementById("payments-root");
  if (!root) return;
  const table =
    rows.length === 0
      ? `<p class="text-on-surface-variant text-center py-8">لا توجد طرق دفع.</p>`
      : `<div class="overflow-x-auto">
        <table class="w-full text-right min-w-[640px]">
          <thead>
            <tr class="text-label-md text-primary border-b border-outline-variant">
              <th class="px-6 py-3">الطريقة</th>
              <th class="px-6 py-3">الوصف</th>
              <th class="px-6 py-3">الترتيب</th>
              <th class="px-6 py-3">الظهور</th>
              <th class="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-variant/40">
            ${rows.map(rowHtml).join("")}
          </tbody>
        </table>
      </div>`;
  root.innerHTML =
    renderRateCard() +
    `<section class="border border-outline-variant rounded-lg overflow-hidden bg-surface-container-low">
      <div class="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-high/40">
        <h3 class="text-headline-sm font-headline-sm text-on-surface">طرق الدفع</h3>
        <button type="button" id="btn-new-payment" class="bg-primary text-on-primary font-label-md px-4 py-2 flex items-center gap-1">
          <span class="material-symbols-outlined text-lg">add</span> إضافة طريقة
        </button>
      </div>
      ${table}
    </section>`;
  bindHandlers();
}

/** @param {PayRow} r */
function rowHtml(r) {
  const active = isActiveVal(r.isActive);
  return `
    <tr class="hover:bg-surface-container-highest/40">
      <td class="px-6 py-3">
        <p class="font-body-md text-on-surface">${escapeHtml(r.nameAr)}</p>
        <p class="text-label-sm text-on-surface-variant font-mono dir-ltr">${escapeHtml(r.slug)}</p>
      </td>
      <td class="px-6 py-3 text-label-sm text-on-surface-variant max-w-xs">${escapeHtml(r.descriptionAr || "—")}</td>
      <td class="px-6 py-3 font-mono">${r.sortOrder}</td>
      <td class="px-6 py-3">
        <label class="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" class="rounded border-outline-variant text-primary js-pay-active" data-id="${r.id}" ${active ? "checked" : ""}/>
          <span class="text-label-sm">${active ? "متاحة" : "معطّلة"}</span>
        </label>
      </td>
      <td class="px-6 py-3">
        <button type="button" class="text-primary text-label-sm hover:underline js-pay-edit" data-id="${r.id}">تعديل</button>
        <button type="button" class="text-error text-label-sm hover:underline mr-3 js-pay-del" data-id="${r.id}">حذف</button>
      </td>
    </tr>`;
}

function bindHandlers() {
  document.getElementById("save-usd-rate")?.addEventListener("click", async () => {
    const input = document.getElementById("usd-iqd-rate");
    const msg = document.getElementById("rate-msg");
    if (!(input instanceof HTMLInputElement)) return;
    try {
      usdRate = await updateUsdIqdRate(input.value);
      input.value = String(usdRate);
      if (msg) {
        msg.textContent = "تم حفظ سعر الصرف.";
        msg.classList.remove("hidden", "text-error");
        msg.classList.add("text-primary");
      }
    } catch (err) {
      if (msg) {
        msg.textContent = err instanceof Error ? err.message : "تعذر الحفظ";
        msg.classList.remove("hidden");
        msg.classList.add("text-error");
      }
    }
  });

  document.getElementById("btn-new-payment")?.addEventListener("click", () => openModal(null));
  document.querySelectorAll(".js-pay-active").forEach((el) => {
    el.addEventListener("change", async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      const id = Number(t.dataset.id);
      try {
        await updatePaymentMethod(id, { isActive: t.checked });
        const r = rows.find((x) => x.id === id);
        if (r) r.isActive = t.checked ? 1 : 0;
      } catch {
        t.checked = !t.checked;
      }
    });
  });
  document.querySelectorAll(".js-pay-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = rows.find((x) => x.id === Number(btn.getAttribute("data-id")));
      if (r) openModal(r);
    });
  });
  document.querySelectorAll(".js-pay-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-id"));
      const r = rows.find((x) => x.id === id);
      if (!r || !confirm(`حذف «${r.nameAr}»؟`)) return;
      try {
        await deletePaymentMethod(id);
        await reload();
      } catch (err) {
        alert(err instanceof Error ? err.message : "تعذر الحذف");
      }
    });
  });
}

/** @param {PayRow|null} row */
function openModal(row) {
  const modal = document.getElementById("pay-modal");
  if (!modal) return;
  document.getElementById("pay-modal-title").textContent = row ? "تعديل طريقة دفع" : "طريقة دفع جديدة";
  document.getElementById("pay-edit-id").value = row ? String(row.id) : "";
  document.getElementById("pay-name-ar").value = row?.nameAr || "";
  document.getElementById("pay-name-en").value = row?.nameEn || "";
  document.getElementById("pay-slug").value = row?.slug || "";
  document.getElementById("pay-desc").value = row?.descriptionAr || "";
  document.getElementById("pay-sort").value = String(row?.sortOrder ?? 0);
  document.getElementById("pay-active").checked = row ? isActiveVal(row.isActive) : true;
  const err = document.getElementById("pay-form-error");
  if (err) {
    err.textContent = "";
    err.classList.add("hidden");
  }
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
}

function closeModal() {
  document.getElementById("pay-modal")?.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

async function reload() {
  const [rate, list] = await Promise.all([fetchUsdIqdRate(), fetchPaymentMethods()]);
  if (rate) usdRate = rate;
  if (list) rows = list;
  renderMethods();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (isSupabaseAuthConfigured()) await syncAdminTokenFromSupabaseSession();
  document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
  });
  document.getElementById("pay-modal-close")?.addEventListener("click", closeModal);
  document.getElementById("pay-modal-backdrop")?.addEventListener("click", closeModal);
  document.getElementById("pay-suggest-slug")?.addEventListener("click", () => {
    const en = document.getElementById("pay-name-en")?.value || "";
    document.getElementById("pay-slug").value = suggestSlug(en || document.getElementById("pay-name-ar")?.value);
  });
  document.getElementById("pay-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("pay-form-error");
    const editId = document.getElementById("pay-edit-id")?.value;
    const body = {
      nameAr: document.getElementById("pay-name-ar")?.value?.trim(),
      nameEn: document.getElementById("pay-name-en")?.value?.trim() || null,
      slug: document.getElementById("pay-slug")?.value?.trim(),
      descriptionAr: document.getElementById("pay-desc")?.value?.trim() || null,
      sortOrder: Number(document.getElementById("pay-sort")?.value) || 0,
      isActive: document.getElementById("pay-active")?.checked,
    };
    try {
      if (editId) await updatePaymentMethod(Number(editId), body);
      else await createPaymentMethod(body);
      closeModal();
      await reload();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err instanceof Error ? err.message : "تعذر الحفظ";
        errEl.classList.remove("hidden");
      }
    }
  });
  if (!getAdminToken()) return;
  try {
    await reload();
  } catch {
    const root = document.getElementById("payments-root");
    if (root) root.innerHTML = `<p class="text-error text-center py-12">تعذر التحميل — نفّذ npm run db:push للهجرة 20260530120000.</p>`;
  }
});
