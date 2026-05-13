import { getAdminToken } from "./session.js";
import {
  isSupabaseAuthConfigured,
  syncAdminTokenFromSupabaseSession,
  clearAdminSessionAndSupabase,
} from "./supabaseAuth.js";
import {
  createColorPreset,
  deleteColorPreset,
  fetchColorPresets,
  updateColorPreset,
} from "./adminSupabaseData.js";

/** @typedef {{ id: number, nameAr: string, nameEn?: string|null, hexCode: string, sortOrder: number, isActive: number|boolean }} PresetRow */

/** @type {PresetRow[]} */
let rows = [];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isActiveVal(v) {
  return v === 1 || v === true;
}

function render() {
  const root = document.getElementById("colors-root");
  if (!root) return;
  if (!rows.length) {
    root.innerHTML = `<p class="text-on-surface-variant text-center py-12 border border-dashed border-outline-variant rounded-lg">لا توجد ألوان. اضغط «لون جديد».</p>`;
    return;
  }
  root.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      ${rows
        .map((r) => {
          const hex = escapeHtml(r.hexCode || "#888");
          const active = isActiveVal(r.isActive);
          return `
        <div class="border border-outline-variant rounded-lg p-4 bg-surface-container-low flex flex-col gap-3 ${active ? "" : "opacity-50"}" data-id="${r.id}">
          <div class="flex items-center gap-3">
            <span class="w-12 h-12 rounded-full border-2 border-outline-variant shrink-0 shadow-inner" style="background-color:${hex}"></span>
            <div class="min-w-0 flex-1">
              <p class="font-body-md text-on-surface truncate">${escapeHtml(r.nameAr)}</p>
              <p class="text-label-sm font-mono text-on-surface-variant dir-ltr">${hex}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 mt-auto">
            <button type="button" class="flex-1 px-2 py-1 text-label-sm border border-outline-variant hover:border-primary js-preset-edit" data-id="${r.id}">تعديل</button>
            <button type="button" class="px-2 py-1 text-label-sm text-error border border-error/30 js-preset-del" data-id="${r.id}">حذف</button>
          </div>
        </div>`;
        })
        .join("")}
    </div>`;
  bindHandlers();
}

function bindHandlers() {
  document.querySelectorAll(".js-preset-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-id"));
      const r = rows.find((x) => x.id === id);
      if (r) openModal(r);
    });
  });
  document.querySelectorAll(".js-preset-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-id"));
      const r = rows.find((x) => x.id === id);
      if (!r || !confirm(`حذف اللون «${r.nameAr}»؟`)) return;
      try {
        await deleteColorPreset(id);
        await reload();
      } catch (err) {
        alert(err instanceof Error ? err.message : "تعذر الحذف");
      }
    });
  });
}

function openModal(preset) {
  const modal = document.getElementById("color-modal");
  const err = document.getElementById("color-form-error");
  if (!modal) return;
  if (err) {
    err.textContent = "";
    err.classList.add("hidden");
  }
  document.getElementById("color-modal-title").textContent = preset ? "تعديل لون" : "لون جديد";
  document.getElementById("color-edit-id").value = preset ? String(preset.id) : "";
  document.getElementById("color-name-ar").value = preset?.nameAr || "";
  document.getElementById("color-name-en").value = preset?.nameEn || "";
  document.getElementById("color-hex").value = preset?.hexCode || "#000000";
  document.getElementById("color-sort").value = String(preset?.sortOrder ?? 0);
  document.getElementById("color-active").checked = preset ? isActiveVal(preset.isActive) : true;
  syncPreview();
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
}

function closeModal() {
  document.getElementById("color-modal")?.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

function syncPreview() {
  const hex = document.getElementById("color-hex")?.value?.trim() || "#888888";
  const el = document.getElementById("color-hex-preview");
  if (el) el.style.backgroundColor = hex;
}

async function reload() {
  rows = await fetchColorPresets(false);
  render();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (isSupabaseAuthConfigured()) {
    await syncAdminTokenFromSupabaseSession();
  }
  document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
  });
  document.getElementById("header-new-color")?.addEventListener("click", () => openModal(null));
  document.getElementById("color-modal-close")?.addEventListener("click", closeModal);
  document.getElementById("color-modal-close-2")?.addEventListener("click", closeModal);
  document.getElementById("color-modal-backdrop")?.addEventListener("click", closeModal);
  document.getElementById("color-hex")?.addEventListener("input", syncPreview);

  document.getElementById("color-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("color-form-error");
    if (errEl) {
      errEl.textContent = "";
      errEl.classList.add("hidden");
    }
    const editId = document.getElementById("color-edit-id")?.value;
    const nameAr = document.getElementById("color-name-ar")?.value?.trim() || "";
    const hexCode = document.getElementById("color-hex")?.value?.trim() || "";
    if (!nameAr || !hexCode) {
      if (errEl) {
        errEl.textContent = "الاسم وكود اللون مطلوبان";
        errEl.classList.remove("hidden");
      }
      return;
    }
    const body = {
      nameAr,
      nameEn: document.getElementById("color-name-en")?.value?.trim() || null,
      hexCode,
      sortOrder: Number(document.getElementById("color-sort")?.value) || 0,
      isActive: document.getElementById("color-active")?.checked !== false,
    };
    try {
      if (editId) await updateColorPreset(Number(editId), body);
      else await createColorPreset(body);
      closeModal();
      await reload();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err instanceof Error ? err.message : "خطأ";
        errEl.classList.remove("hidden");
      }
    }
  });

  if (!getAdminToken()) return;
  try {
    await reload();
  } catch {
    const root = document.getElementById("colors-root");
    if (root) {
      root.innerHTML = `<p class="text-error text-center py-12">تعذر التحميل — نفّذ npm run db:push للهجرة 20260527120000.</p>`;
    }
  }
});
