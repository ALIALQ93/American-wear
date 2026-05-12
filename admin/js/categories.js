import { getAdminToken } from "./session.js";
import {
  isSupabaseAuthConfigured,
  syncAdminTokenFromSupabaseSession,
  clearAdminSessionAndSupabase,
} from "./supabaseAuth.js";
import {
  createCategory,
  createSection,
  deleteCategory,
  deleteSection,
  fetchCategoriesTree,
  updateCategory,
  updateSection,
  uploadCategoryCoverImage,
  uploadSectionCoverImage,
} from "./adminSupabaseData.js";

/** @typedef {{ id: number, nameAr: string, nameEn?: string|null, slug: string, descriptionAr?: string|null, imageUrl?: string|null, sortOrder: number, isActive: number|boolean, sections?: SectionRow[] }} Cat */
/** @typedef {{ id: number, categoryId: number, nameAr: string, nameEn?: string|null, slug: string, imageUrl?: string|null, sortOrder: number, isActive: number|boolean }} SectionRow */

/** @type {Cat[]} */
let tree = [];

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

function setCatImageUploadMsg(text, isError) {
  const el = document.getElementById("cat-image-upload-msg");
  if (!el) return;
  if (!text) {
    el.textContent = "";
    el.classList.add("hidden");
    el.classList.remove("text-error", "text-primary");
    return;
  }
  el.textContent = text;
  el.classList.remove("hidden");
  el.classList.toggle("text-error", Boolean(isError));
  el.classList.toggle("text-primary", !isError);
}

function syncCatImagePreview() {
  const url = document.getElementById("cat-image-url")?.value?.trim() || "";
  const wrap = document.getElementById("cat-image-preview-wrap");
  const img = document.getElementById("cat-image-preview");
  if (!wrap || !img) return;
  if (!url) {
    img.removeAttribute("src");
    wrap.classList.add("hidden");
    return;
  }
  img.src = url;
  wrap.classList.remove("hidden");
}

function syncSecImagePreview() {
  const url = document.getElementById("sec-image-url")?.value?.trim() || "";
  const wrap = document.getElementById("sec-image-preview-wrap");
  const img = document.getElementById("sec-image-preview");
  if (!wrap || !img) return;
  if (!url) {
    img.removeAttribute("src");
    wrap.classList.add("hidden");
    return;
  }
  img.src = url;
  wrap.classList.remove("hidden");
}

function setSecImageUploadMsg(text, isError) {
  const el = document.getElementById("sec-image-upload-msg");
  if (!el) return;
  if (!text) {
    el.textContent = "";
    el.classList.add("hidden");
    el.classList.remove("text-error", "text-primary");
    return;
  }
  el.textContent = text;
  el.classList.remove("hidden");
  el.classList.toggle("text-error", Boolean(isError));
  el.classList.toggle("text-primary", !isError);
}

function suggestSlug(text) {
  const base = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "item";
}

function showBanner(msg) {
  const el = document.getElementById("page-banner");
  if (!el) return;
  if (!msg) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
}

function sortedCats(list) {
  return [...list].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || a.id - b.id);
}

function countActiveCategories(list) {
  return list.filter((c) => isActiveVal(c.isActive)).length;
}

/** منع إخفاء آخر تصنيف نشط */
function assertCanDeactivateCategory(catId) {
  const c = tree.find((x) => Number(x.id) === Number(catId));
  if (!c || !isActiveVal(c.isActive)) return { ok: true };
  if (countActiveCategories(tree) <= 1) {
    return {
      ok: false,
      message: "لا يمكن إخفاء آخر تصنيف نشط — فعّل تصنيفاً آخراً أولاً أو أنشئ تصنيفاً جديداً ثم أخف هذا.",
    };
  }
  return { ok: true };
}

function categoryHasActiveSections(c) {
  return (c.sections || []).some((s) => isActiveVal(s.isActive));
}

function sortedSecs(list) {
  return [...(list || [])].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || a.id - b.id);
}

/** تعبئة قائمة التصنيف الرئيسي للقسم (كل قسم تابع لتصنيف واحد) */
function fillSecParentCategorySelect(preferredId) {
  const sel = document.getElementById("sec-parent-category");
  if (!sel) return;
  const cats = sortedCats(tree);
  sel.innerHTML = cats.map((c) => `<option value="${c.id}">${escapeHtml(c.nameAr)}</option>`).join("");
  const pref = Number(preferredId);
  if (cats.some((c) => Number(c.id) === pref)) sel.value = String(pref);
  else if (cats[0]) sel.value = String(cats[0].id);
}

function render() {
  const root = document.getElementById("cats-root");
  if (!root) return;
  if (!tree.length) {
    root.innerHTML = `<p class="text-on-surface-variant text-body-md py-12 text-center border border-dashed border-outline-variant rounded-lg">لا توجد تصنيفات بعد. اضغط «تصنيف جديد» لإنشاء التصنيف الأول ثم أضف الأقسام الفرعية.</p>`;
    return;
  }
  const html = sortedCats(tree)
    .map((c) => {
      const active = isActiveVal(c.isActive);
      const secs = sortedSecs(c.sections);
      const secRows = secs
        .map(
          (s) => {
            const secThumb = s.imageUrl
              ? `<div class="w-9 h-9 shrink-0 rounded border border-outline-variant overflow-hidden bg-surface-container"><img src="${escapeHtml(s.imageUrl)}" alt="" class="w-full h-full object-cover"/></div>`
              : "";
            return `
        <tr class="border-b border-outline-variant/40 hover:bg-surface-container-highest/40" data-section-id="${s.id}">
          <td class="px-4 py-3 font-body-md text-on-surface">
            <div class="flex items-center gap-2 min-w-0">
              ${secThumb}
              <span class="min-w-0">${escapeHtml(s.nameAr)}</span>
            </div>
          </td>
          <td class="px-4 py-3 text-label-sm text-on-surface-variant font-mono dir-ltr text-left">${escapeHtml(s.slug)}</td>
          <td class="px-4 py-3 text-label-sm text-on-surface-variant">${Number(s.sortOrder) || 0}</td>
          <td class="px-4 py-3">
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" class="rounded border-outline-variant text-primary js-sec-active" data-id="${s.id}" ${isActiveVal(s.isActive) ? "checked" : ""}/>
              <span class="text-label-sm text-on-surface-variant js-sec-active-label">${isActiveVal(s.isActive) ? "ظاهر" : "مخفي"}</span>
            </label>
          </td>
          <td class="px-4 py-3">
            <div class="flex flex-wrap gap-1 justify-end">
              <button type="button" class="p-1.5 rounded hover:bg-primary/10 text-on-surface-variant hover:text-primary js-sec-edit" data-cat-id="${c.id}" data-id="${s.id}" title="تعديل"><span class="material-symbols-outlined text-lg">edit</span></button>
              <button type="button" class="p-1.5 rounded hover:bg-error/10 text-on-surface-variant hover:text-error js-sec-del" data-id="${s.id}" title="حذف"><span class="material-symbols-outlined text-lg">delete</span></button>
            </div>
          </td>
        </tr>`;
          },
        )
        .join("");
      const thumbBlock = c.imageUrl
        ? `<div class="w-14 h-14 shrink-0 rounded border border-outline-variant overflow-hidden bg-surface-container"><img src="${escapeHtml(c.imageUrl)}" alt="" class="w-full h-full object-cover"/></div>`
        : "";
      const nameEnSuffix = c.nameEn ? ` · ${escapeHtml(c.nameEn)}` : "";
      return `
      <article class="bg-surface-container-low border border-outline-variant rounded-lg overflow-hidden" data-category-id="${c.id}">
        <div class="px-5 py-4 flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant bg-surface-container-high/40">
          <div class="flex gap-3 min-w-0 flex-1">
            ${thumbBlock}
            <div class="min-w-0">
            <h3 class="text-headline-sm font-headline-sm text-on-surface">${escapeHtml(c.nameAr)}</h3>
            <p class="text-label-sm text-on-surface-variant mt-1"><span class="font-mono dir-ltr inline-block">${escapeHtml(c.slug)}</span>${nameEnSuffix}</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" class="rounded border-outline-variant text-primary js-cat-active" data-id="${c.id}" ${active ? "checked" : ""}/>
              <span class="text-label-sm text-on-surface-variant js-cat-active-label">${active ? "التصنيف ظاهر" : "مخفي"}</span>
            </label>
            <button type="button" class="px-3 py-1.5 text-label-sm border border-outline-variant hover:border-primary js-cat-edit" data-id="${c.id}">تعديل التصنيف</button>
            <button type="button" class="px-3 py-1.5 text-label-sm bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 js-sec-add" data-cat-id="${c.id}">+ قسم</button>
            <button type="button" class="px-3 py-1.5 text-label-sm text-error border border-error/30 hover:bg-error/10 js-cat-del" data-id="${c.id}">حذف</button>
          </div>
        </div>
        <div class="px-5 py-4">
          <h4 class="text-label-md text-primary mb-1">الأقسام الفرعية</h4>
          <p class="text-label-sm text-on-surface-variant mb-3">هذه الأقسام مخزّنة كـ<strong class="text-on-surface font-medium">تابعة لهذا التصنيف</strong> فقط؛ عند إضافة قسم من زر «+ قسم» يُربط تلقائياً بهذا التصنيف ويمكنك لاحقاً تغيير التصنيف من نموذج تعديل القسم إن لزم.</p>
          <div class="overflow-x-auto rounded border border-outline-variant/60">
            <table class="w-full text-right min-w-[520px]">
              <thead>
                <tr class="bg-surface-container-high text-label-sm text-primary">
                  <th class="px-4 py-2 font-bold">الاسم</th>
                  <th class="px-4 py-2 font-bold">slug</th>
                  <th class="px-4 py-2 font-bold">ترتيب</th>
                  <th class="px-4 py-2 font-bold">الظهور</th>
                  <th class="px-4 py-2 font-bold text-left w-28">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${secRows || `<tr><td colspan="5" class="px-4 py-6 text-center text-on-surface-variant text-label-sm">لا توجد أقسام — أضف قسماً فرعياً.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </article>`;
    })
    .join("");
  root.innerHTML = html;
  bindListHandlers();
}

function bindListHandlers() {
  document.querySelectorAll(".js-cat-active").forEach((el) => {
    el.addEventListener("change", async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      const id = Number(t.dataset.id);
      const on = t.checked;
      const label = t.closest("label")?.querySelector(".js-cat-active-label");
      const cat = tree.find((x) => x.id === id);
      if (!on) {
        const guard = assertCanDeactivateCategory(id);
        if (!guard.ok) {
          showBanner(guard.message);
          t.checked = true;
          return;
        }
        if (cat && categoryHasActiveSections(cat)) {
          const ok = window.confirm(
            "هذا التصنيف يحتوي على أقسام فرعية ما زالت «ظاهرة». سيُخفى التصنيف من المتجر (رأس الهرم)؛ الأقسام تبقى في الإدارة ويمكنك إخفاءها لاحقاً من الجدول. هل تريد المتابعة؟",
          );
          if (!ok) {
            t.checked = true;
            return;
          }
        }
      }
      try {
        await patchCategory(id, { isActive: on });
        const c = tree.find((x) => x.id === id);
        if (c) c.isActive = on ? 1 : 0;
        if (label) label.textContent = on ? "التصنيف ظاهر" : "مخفي";
        showBanner("");
      } catch {
        t.checked = !on;
      }
    });
  });
  document.querySelectorAll(".js-sec-active").forEach((el) => {
    el.addEventListener("change", async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      const id = Number(t.dataset.id);
      const on = t.checked;
      const label = t.closest("label")?.querySelector(".js-sec-active-label");
      try {
        await patchSection(id, { isActive: on });
        for (const c of tree) {
          const s = c.sections?.find((x) => x.id === id);
          if (s) {
            s.isActive = on ? 1 : 0;
            break;
          }
        }
        if (label) label.textContent = on ? "ظاهر" : "مخفي";
      } catch {
        t.checked = !on;
      }
    });
  });
  document.querySelectorAll(".js-cat-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-id"));
      const c = tree.find((x) => x.id === id);
      if (c) openCategoryModal(c);
    });
  });
  document.querySelectorAll(".js-sec-add").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cid = Number(btn.getAttribute("data-cat-id"));
      openSectionModal(cid, null);
    });
  });
  document.querySelectorAll(".js-sec-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sid = Number(btn.getAttribute("data-id"));
      const cid = Number(btn.getAttribute("data-cat-id"));
      const c = tree.find((x) => x.id === cid);
      const s = c?.sections?.find((x) => x.id === sid);
      if (s) openSectionModal(cid, s);
    });
  });
  document.querySelectorAll(".js-cat-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-id"));
      const c = tree.find((x) => x.id === id);
      if (!c) return;
      if (!confirm(`حذف التصنيف «${c.nameAr}» وجميع أقسامه الفرعية؟ يُسمح فقط إن لم تكن هناك منتجات مرتبطة به.`)) return;
      try {
        await deleteCategory(id);
        showBanner("");
        await reloadTree();
      } catch (err) {
        showBanner(err instanceof Error ? err.message : "تعذر الحذف");
      }
    });
  });
  document.querySelectorAll(".js-sec-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-id"));
      if (!confirm("حذف هذا القسم الفرعي؟ مسموح فقط إن لم تكن منتجات مرتبطة به.")) return;
      try {
        await deleteSection(id);
        showBanner("");
        await reloadTree();
      } catch (err) {
        showBanner(err instanceof Error ? err.message : "تعذر الحذف");
      }
    });
  });
}

async function patchCategory(id, body) {
  await updateCategory(id, body);
}

async function patchSection(id, body) {
  await updateSection(id, body);
}

function openCategoryModal(c) {
  const modal = document.getElementById("category-modal");
  const err = document.getElementById("category-form-error");
  if (!modal) return;
  if (err) {
    err.textContent = "";
    err.classList.add("hidden");
  }
  document.getElementById("category-modal-title").textContent = c ? "تعديل تصنيف" : "تصنيف جديد";
  document.getElementById("category-edit-id").value = c ? String(c.id) : "";
  document.getElementById("cat-name-ar").value = c?.nameAr || "";
  document.getElementById("cat-name-en").value = c?.nameEn || "";
  document.getElementById("cat-slug").value = c?.slug || "";
  document.getElementById("cat-desc-ar").value = c?.descriptionAr || "";
  const img = document.getElementById("cat-image-url");
  if (img) img.value = c?.imageUrl || "";
  const fileIn = document.getElementById("cat-image-file");
  if (fileIn) fileIn.value = "";
  setCatImageUploadMsg("", false);
  syncCatImagePreview();
  document.getElementById("cat-sort").value = String(c?.sortOrder ?? 0);
  document.getElementById("cat-active").checked = c ? isActiveVal(c.isActive) : true;
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
}

function closeCategoryModal() {
  document.getElementById("category-modal")?.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

function openSectionModal(categoryId, s) {
  const modal = document.getElementById("section-modal");
  const err = document.getElementById("section-form-error");
  if (!modal) return;
  if (err) {
    err.textContent = "";
    err.classList.add("hidden");
  }
  document.getElementById("section-modal-title").textContent = s ? "تعديل قسم فرعي" : "قسم فرعي جديد";
  document.getElementById("section-edit-id").value = s ? String(s.id) : "";
  fillSecParentCategorySelect(s?.categoryId ?? categoryId);
  document.getElementById("sec-name-ar").value = s?.nameAr || "";
  document.getElementById("sec-name-en").value = s?.nameEn || "";
  document.getElementById("sec-slug").value = s?.slug || "";
  const siu = document.getElementById("sec-image-url");
  if (siu) siu.value = s?.imageUrl || "";
  const sfile = document.getElementById("sec-image-file");
  if (sfile) sfile.value = "";
  setSecImageUploadMsg("", false);
  syncSecImagePreview();
  document.getElementById("sec-sort").value = String(s?.sortOrder ?? 0);
  document.getElementById("sec-active").checked = s ? isActiveVal(s.isActive) : true;
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
}

function closeSectionModal() {
  document.getElementById("section-modal")?.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

async function reloadTree() {
  tree = await fetchCategoriesTree(false);
  render();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (isSupabaseAuthConfigured()) {
    await syncAdminTokenFromSupabaseSession();
  }

  document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
    await clearAdminSessionAndSupabase();
    location.href = "./login.html";
  });

  const openNew = () => openCategoryModal(null);
  document.getElementById("sidebar-new-category")?.addEventListener("click", openNew);
  document.getElementById("header-new-category")?.addEventListener("click", openNew);

  document.getElementById("category-modal-close")?.addEventListener("click", closeCategoryModal);
  document.getElementById("category-modal-close-2")?.addEventListener("click", closeCategoryModal);
  document.getElementById("category-modal-backdrop")?.addEventListener("click", closeCategoryModal);
  document.getElementById("section-modal-close")?.addEventListener("click", closeSectionModal);
  document.getElementById("section-modal-close-2")?.addEventListener("click", closeSectionModal);
  document.getElementById("section-modal-backdrop")?.addEventListener("click", closeSectionModal);

  document.getElementById("cat-image-url")?.addEventListener("input", () => syncCatImagePreview());

  document.getElementById("cat-image-file")?.addEventListener("change", async (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement) || !t.files?.length) return;
    const file = t.files[0];
    setCatImageUploadMsg("جاري الرفع…", false);
    try {
      const url = await uploadCategoryCoverImage(file);
      const urlIn = document.getElementById("cat-image-url");
      if (urlIn) urlIn.value = url;
      syncCatImagePreview();
      setCatImageUploadMsg("تم الرفع — اضغط «حفظ» لتخزين الرابط مع التصنيف.", false);
    } catch (err) {
      setCatImageUploadMsg(err instanceof Error ? err.message : "فشل الرفع", true);
      t.value = "";
    }
  });

  document.getElementById("cat-suggest-slug")?.addEventListener("click", () => {
    const en = document.getElementById("cat-name-en")?.value || "";
    document.getElementById("cat-slug").value = suggestSlug(en);
  });
  document.getElementById("sec-suggest-slug")?.addEventListener("click", () => {
    const en = document.getElementById("sec-name-en")?.value || "";
    document.getElementById("sec-slug").value = suggestSlug(en);
  });

  document.getElementById("sec-image-url")?.addEventListener("input", () => syncSecImagePreview());

  document.getElementById("sec-image-file")?.addEventListener("change", async (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement) || !t.files?.length) return;
    const file = t.files[0];
    setSecImageUploadMsg("جاري الرفع…", false);
    try {
      const url = await uploadSectionCoverImage(file);
      const urlIn = document.getElementById("sec-image-url");
      if (urlIn) urlIn.value = url;
      syncSecImagePreview();
      setSecImageUploadMsg("تم الرفع — اضغط «حفظ» لتخزين الرابط مع القسم.", false);
    } catch (err) {
      setSecImageUploadMsg(err instanceof Error ? err.message : "فشل الرفع", true);
      t.value = "";
    }
  });

  document.getElementById("category-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("category-form-error");
    if (errEl) {
      errEl.textContent = "";
      errEl.classList.add("hidden");
    }
    const editId = document.getElementById("category-edit-id")?.value;
    const nameAr = document.getElementById("cat-name-ar")?.value?.trim() || "";
    const nameEn = document.getElementById("cat-name-en")?.value?.trim() || "";
    const slug = document.getElementById("cat-slug")?.value?.trim().toLowerCase() || "";
    if (!nameAr || !nameEn || !slug) {
      if (errEl) {
        errEl.textContent = "الاسم العربي والإنجليزي و slug مطلوبان";
        errEl.classList.remove("hidden");
      }
      return;
    }
    const editIdNum = editId ? Number(editId) : NaN;
    const wantActive = document.getElementById("cat-active")?.checked !== false;
    if (!editId && !wantActive && countActiveCategories(tree) === 0) {
      if (errEl) {
        errEl.textContent = "يجب أن يبقى تصنيف واحد على الأقل ظاهراً في المتجر — فعّل «ظاهر» أو أنشئ تصنيفاً نشطاً أولاً.";
        errEl.classList.remove("hidden");
      }
      return;
    }
    if (editId && Number.isFinite(editIdNum) && !wantActive) {
      const guard = assertCanDeactivateCategory(editIdNum);
      if (!guard.ok) {
        if (errEl) {
          errEl.textContent = guard.message;
          errEl.classList.remove("hidden");
        }
        return;
      }
      const cat = tree.find((x) => Number(x.id) === editIdNum);
      if (cat && categoryHasActiveSections(cat)) {
        const ok = window.confirm(
          "يوجد أقسام فرعية نشطة تحت هذا التصنيف. سيُخفى التصنيف من المتجر؛ يمكنك لاحقاً إخفاء الأقسام من الجدول. متابعة الحفظ؟",
        );
        if (!ok) return;
      }
    }
    const body = {
      nameAr,
      nameEn,
      slug,
      descriptionAr: document.getElementById("cat-desc-ar")?.value?.trim() || null,
      imageUrl: document.getElementById("cat-image-url")?.value?.trim() || null,
      sortOrder: Number(document.getElementById("cat-sort")?.value) || 0,
      isActive: wantActive,
    };
    try {
      if (editId) {
        await patchCategory(Number(editId), body);
      } else {
        await createCategory(body);
      }
      closeCategoryModal();
      showBanner("");
      await reloadTree();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err instanceof Error ? err.message : "خطأ";
        errEl.classList.remove("hidden");
      }
    }
  });

  document.getElementById("section-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("section-form-error");
    if (errEl) {
      errEl.textContent = "";
      errEl.classList.add("hidden");
    }
    const editId = document.getElementById("section-edit-id")?.value;
    const categoryId = Number(document.getElementById("sec-parent-category")?.value);
    const nameAr = document.getElementById("sec-name-ar")?.value?.trim() || "";
    const slug = document.getElementById("sec-slug")?.value?.trim().toLowerCase() || "";
    if (!nameAr || !slug || !Number.isFinite(categoryId)) {
      if (errEl) {
        errEl.textContent = "اختر التصنيف الرئيسي وأدخل الاسم و slug";
        errEl.classList.remove("hidden");
      }
      return;
    }
    const body = {
      nameAr,
      nameEn: document.getElementById("sec-name-en")?.value?.trim() || null,
      slug,
      imageUrl: document.getElementById("sec-image-url")?.value?.trim() || null,
      sortOrder: Number(document.getElementById("sec-sort")?.value) || 0,
      isActive: document.getElementById("sec-active")?.checked !== false,
    };
    try {
      if (editId) {
        await patchSection(Number(editId), { ...body, categoryId });
      } else {
        await createSection(categoryId, body);
      }
      closeSectionModal();
      showBanner("");
      await reloadTree();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err instanceof Error ? err.message : "خطأ";
        errEl.classList.remove("hidden");
      }
    }
  });

  if (!getAdminToken()) return;

  try {
    await reloadTree();
  } catch {
    const root = document.getElementById("cats-root");
    if (root) {
      root.innerHTML = `<p class="text-error text-center py-12">تعذر تحميل البيانات من Supabase. نفّذ npm run db:push للهجرة 20260520140000.</p>`;
    }
  }

  if (location.hash === "#add") openCategoryModal(null);
});
