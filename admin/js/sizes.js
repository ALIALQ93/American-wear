import { getAdminToken } from "./session.js";
import {
  isSupabaseAuthConfigured,
  syncAdminTokenFromSupabaseSession,
  clearAdminSessionAndSupabase,
} from "./supabaseAuth.js";
import {
  createSizeSet,
  deleteSizeSet,
  fetchSizeSets,
  saveSizeSetItems,
  updateSizeSet,
} from "./adminSupabaseData.js";

/** @typedef {{ id: number, nameAr: string, nameEn?: string|null, slug: string, sortOrder: number, isActive: number|boolean, items: { id: number, label: string, sortOrder: number }[] }} SizeSetRow */

/** @type {SizeSetRow[]} */
let sets = [];

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

function suggestSlug(text) {
  const base = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "set";
}

function render() {
  const root = document.getElementById("sizes-root");
  if (!root) return;
  if (!sets.length) {
    root.innerHTML = `<p class="text-on-surface-variant text-center py-12 border border-dashed border-outline-variant rounded-lg">لا توجد مجموعات مقاسات. اضغط «مجموعة جديدة».</p>`;
    return;
  }
  root.innerHTML = sets
    .map((s) => {
      const chips = (s.items || []).map((it) => `<span class="inline-block px-2 py-1 text-label-sm border border-outline-variant rounded font-mono">${escapeHtml(it.label)}</span>`).join(" ");
      const active = isActiveVal(s.isActive);
      return `
      <article class="mb-6 border border-outline-variant rounded-lg overflow-hidden bg-surface-container-low" data-set-id="${s.id}">
        <div class="px-5 py-4 flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant bg-surface-container-high/40">
          <div>
            <h3 class="text-headline-sm font-headline-sm text-on-surface">${escapeHtml(s.nameAr)}</h3>
            <p class="text-label-sm text-on-surface-variant mt-1 font-mono dir-ltr">${escapeHtml(s.slug)}${s.nameEn ? ` · ${escapeHtml(s.nameEn)}` : ""}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" class="rounded border-outline-variant text-primary js-set-active" data-id="${s.id}" ${active ? "checked" : ""}/>
              <span class="text-label-sm text-on-surface-variant">${active ? "نشطة" : "معطّلة"}</span>
            </label>
            <button type="button" class="px-3 py-1.5 text-label-sm border border-outline-variant hover:border-primary js-set-edit" data-id="${s.id}">تعديل</button>
            <button type="button" class="px-3 py-1.5 text-label-sm text-error border border-error/30 hover:bg-error/10 js-set-del" data-id="${s.id}">حذف</button>
          </div>
        </div>
        <div class="px-5 py-4">
          <p class="text-label-sm text-on-surface-variant mb-2">المقاسات (${(s.items || []).length})</p>
          <div class="flex flex-wrap gap-2">${chips || '<span class="text-on-surface-variant text-label-sm">—</span>'}</div>
        </div>
      </article>`;
    })
    .join("");
  bindListHandlers();
}

function bindListHandlers() {
  document.querySelectorAll(".js-set-active").forEach((el) => {
    el.addEventListener("change", async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      const id = Number(t.dataset.id);
      const on = t.checked;
      try {
        await updateSizeSet(id, { isActive: on });
        const s = sets.find((x) => x.id === id);
        if (s) s.isActive = on ? 1 : 0;
      } catch {
        t.checked = !on;
      }
    });
  });
  document.querySelectorAll(".js-set-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-id"));
      const s = sets.find((x) => x.id === id);
      if (s) openModal(s);
    });
  });
  document.querySelectorAll(".js-set-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-id"));
      const s = sets.find((x) => x.id === id);
      if (!s) return;
      if (!confirm(`حذف مجموعة «${s.nameAr}»؟`)) return;
      try {
        await deleteSizeSet(id);
        await reload();
      } catch (err) {
        alert(err instanceof Error ? err.message : "تعذر الحذف");
      }
    });
  });
}

function openModal(set) {
  const modal = document.getElementById("set-modal");
  const err = document.getElementById("set-form-error");
  if (!modal) return;
  if (err) {
    err.textContent = "";
    err.classList.add("hidden");
  }
  document.getElementById("set-modal-title").textContent = set ? "تعديل مجموعة مقاسات" : "مجموعة مقاسات جديدة";
  document.getElementById("set-edit-id").value = set ? String(set.id) : "";
  document.getElementById("set-name-ar").value = set?.nameAr || "";
  document.getElementById("set-name-en").value = set?.nameEn || "";
  document.getElementById("set-slug").value = set?.slug || "";
  document.getElementById("set-sort").value = String(set?.sortOrder ?? 0);
  document.getElementById("set-active").checked = set ? isActiveVal(set.isActive) : true;
  const labels = (set?.items || []).map((it) => it.label).join("\n");
  document.getElementById("set-labels").value = labels;
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
}

function closeModal() {
  document.getElementById("set-modal")?.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

async function reload() {
  sets = await fetchSizeSets(false);
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
  document.getElementById("header-new-set")?.addEventListener("click", () => openModal(null));
  document.getElementById("set-modal-close")?.addEventListener("click", closeModal);
  document.getElementById("set-modal-close-2")?.addEventListener("click", closeModal);
  document.getElementById("set-modal-backdrop")?.addEventListener("click", closeModal);
  document.getElementById("set-suggest-slug")?.addEventListener("click", () => {
    const en = document.getElementById("set-name-en")?.value || "";
    document.getElementById("set-slug").value = suggestSlug(en);
  });

  document.getElementById("set-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("set-form-error");
    if (errEl) {
      errEl.textContent = "";
      errEl.classList.add("hidden");
    }
    const editId = document.getElementById("set-edit-id")?.value;
    const nameAr = document.getElementById("set-name-ar")?.value?.trim() || "";
    const slug = document.getElementById("set-slug")?.value?.trim().toLowerCase() || "";
    const labelsRaw = document.getElementById("set-labels")?.value || "";
    const labels = labelsRaw
      .split(/[\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!nameAr || !slug) {
      if (errEl) {
        errEl.textContent = "الاسم العربي و slug مطلوبان";
        errEl.classList.remove("hidden");
      }
      return;
    }
    if (!labels.length) {
      if (errEl) {
        errEl.textContent = "أدخل مقاساً واحداً على الأقل (سطر لكل مقاس)";
        errEl.classList.remove("hidden");
      }
      return;
    }
    const body = {
      nameAr,
      nameEn: document.getElementById("set-name-en")?.value?.trim() || null,
      slug,
      sortOrder: Number(document.getElementById("set-sort")?.value) || 0,
      isActive: document.getElementById("set-active")?.checked !== false,
    };
    try {
      let setId;
      if (editId) {
        setId = Number(editId);
        await updateSizeSet(setId, body);
      } else {
        setId = await createSizeSet(body);
      }
      await saveSizeSetItems(setId, labels);
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
    const root = document.getElementById("sizes-root");
    if (root) {
      root.innerHTML = `<p class="text-error text-center py-12">تعذر التحميل — نفّذ npm run db:push للهجرة 20260526120000.</p>`;
    }
  }
});
