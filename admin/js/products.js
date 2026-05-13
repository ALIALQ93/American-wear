import { getAdminToken } from "./session.js";
import { isSupabaseAuthConfigured, syncAdminTokenFromSupabaseSession, clearAdminSessionAndSupabase } from "./supabaseAuth.js";
import {
  fetchColorPresets,
  fetchCategoriesTree,
  fetchProductInventory,
  fetchProductsList,
  fetchProductsStats,
  fetchSizeSets,
  saveProductWithInventory,
  updateProduct,
} from "./adminSupabaseData.js";
import {
  getProductInventoryPayload,
  initProductInventoryPanel,
  loadSizeLabelsForSetId,
  resetProductInventory,
  setColorPresets,
  setProductInventoryState,
} from "./productInventory.js";

/** @typedef {{ id: number, nameAr: string, nameEn?: string|null, category?: string|null, sku?: string|null, priceIqd: number, stock: number, isActive: number|boolean, imageUrl?: string|null, categoryId?: number|null, sectionId?: number|null, subsectionId?: number|null, categoryNameAr?: string|null, sectionNameAr?: string|null, subsectionNameAr?: string|null, variantMode?: string, sizeSetId?: number|null }} ProductRow */

let categoriesTree = [];
/** @type {{ id: number, nameAr: string, slug: string }[]} */
let sizeSetsCache = [];
/** @type {ProductRow[]} */
let productsCache = [];
let searchQuery = "";

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

/** @param {ProductRow} p */
function categoryDisplayLabel(p) {
  const parts = [];
  if (p.categoryNameAr) parts.push(p.categoryNameAr);
  if (p.sectionNameAr) parts.push(p.sectionNameAr);
  if (p.subsectionNameAr) parts.push(p.subsectionNameAr);
  if (parts.length) return parts.join(" ← ");
  return p.category || "—";
}

function stockBarPercent(stock) {
  const s = Number(stock) || 0;
  if (s <= 0) return 0;
  return Math.min(100, Math.round((s / 80) * 100));
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function renderStats(stats) {
  setText("stat-prod-total", formatNumber(stats.total ?? 0));
  setText("stat-prod-instock", formatNumber(stats.inStock ?? 0));
  setText("stat-prod-low", formatNumber(stats.lowStock ?? 0));
  setText("stat-prod-value", formatNumber(stats.inventoryValueIqd ?? 0));
}

function filterProducts() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return productsCache;
  return productsCache.filter((p) => {
    const blob = [p.nameAr, p.nameEn, p.sku, p.category, p.categoryNameAr, p.sectionNameAr, p.subsectionNameAr].filter(Boolean).join(" ").toLowerCase();
    return blob.includes(q);
  });
}

/** @param {ProductRow} p */
function rowHtml(p) {
  const active = p.isActive === 1 || p.isActive === true;
  const low = Number(p.stock) > 0 && Number(p.stock) < 10;
  const stockClass = Number(p.stock) <= 0 ? "text-error font-bold" : low ? "text-error font-bold" : "text-on-surface";
  const barClass = Number(p.stock) <= 0 ? "bg-outline-variant" : low ? "bg-error" : "bg-primary";
  const pct = stockBarPercent(p.stock);
  const img = p.imageUrl
    ? `<img src="${escapeHtml(p.imageUrl)}" alt="" class="w-full h-full object-cover"/>`
    : `<span class="text-on-surface-variant text-xs flex items-center justify-center h-full">—</span>`;
  return `
    <tr class="hover:bg-surface-container-highest/60 transition-colors group" data-product-id="${p.id}">
      <td class="px-6 py-4">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 bg-surface-container-high border border-outline-variant shrink-0 overflow-hidden">${img}</div>
          <div>
            <p class="font-body-md text-on-surface">${escapeHtml(p.nameAr)}</p>
            ${p.nameEn ? `<p class="text-label-sm text-on-surface-variant">${escapeHtml(p.nameEn)}</p>` : `<p class="text-label-sm text-on-surface-variant opacity-50">SKU: ${escapeHtml(p.sku || "—")}</p>`}
          </div>
        </div>
      </td>
      <td class="px-6 py-4">
        <span class="inline-block bg-surface-container-high text-on-surface-variant px-3 py-1 text-label-sm border border-outline-variant max-w-[200px] truncate">${escapeHtml(categoryDisplayLabel(p))}</span>
      </td>
      <td class="px-6 py-4 text-left font-body-md text-primary font-semibold">${formatNumber(p.priceIqd)}</td>
      <td class="px-6 py-4">
        <span class="${stockClass} font-body-md">${formatNumber(p.stock)}</span>
        <div class="w-28 h-1 bg-outline-variant mt-2 rounded-full overflow-hidden">
          <div class="h-full ${barClass} transition-all" style="width:${pct}%"></div>
        </div>
      </td>
      <td class="px-6 py-4">
        <label class="relative inline-flex items-center cursor-pointer gap-2">
          <input type="checkbox" class="sr-only peer js-prod-active" data-id="${p.id}" ${active ? "checked" : ""}/>
          <div class="w-11 h-6 bg-surface-container-highest rounded-full peer-checked:bg-primary relative after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all rtl:peer-checked:after:translate-x-full peer-checked:after:-translate-x-full"></div>
          <span class="text-label-sm text-on-surface-variant js-active-label">${active ? "نشط" : "مخفي"}</span>
        </label>
      </td>
      <td class="px-6 py-4">
        <div class="flex justify-center gap-1">
          <button type="button" class="p-2 rounded hover:bg-primary/10 text-on-surface-variant hover:text-primary js-prod-edit" data-id="${p.id}" title="تعديل"><span class="material-symbols-outlined text-xl">edit</span></button>
          <button type="button" class="p-2 rounded hover:bg-surface-container-high text-on-surface-variant js-prod-view" data-url="${escapeHtml(p.imageUrl || "")}" title="معاينة الصورة"><span class="material-symbols-outlined text-xl">visibility</span></button>
        </div>
      </td>
    </tr>`;
}

function renderTable() {
  const tbody = document.getElementById("products-tbody");
  const countEl = document.getElementById("products-count-label");
  if (!tbody) return;
  const rows = filterProducts();
  if (countEl) countEl.textContent = `عرض ${formatNumber(rows.length)} من أصل ${formatNumber(productsCache.length)} منتج`;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-on-surface-variant">لا توجد منتجات مطابقة للبحث أو القائمة فارغة</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(rowHtml).join("");
  tbody.querySelectorAll(".js-prod-active").forEach((el) => {
    el.addEventListener("change", async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      const id = Number(t.dataset.id);
      const isActive = t.checked;
      const tr = t.closest("tr");
      const label = tr?.querySelector(".js-active-label");
      try {
        await patchProduct(id, { isActive });
        const p = productsCache.find((x) => x.id === id);
        if (p) p.isActive = isActive ? 1 : 0;
        if (label) label.textContent = isActive ? "نشط" : "مخفي";
        const stats = await fetchProductsStats();
        if (stats) renderStats(stats);
      } catch {
        t.checked = !isActive;
      }
    });
  });
  tbody.querySelectorAll(".js-prod-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-id"));
      const p = productsCache.find((x) => x.id === id);
      if (p) openModal(p);
    });
  });
  tbody.querySelectorAll(".js-prod-view").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.getAttribute("data-url");
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    });
  });
}

function fillCategorySelect() {
  const sel = document.getElementById("product-category-id");
  if (!sel) return;
  sel.innerHTML = `<option value="">— بدون تصنيف مرتبط —</option>`;
  for (const c of categoriesTree) {
    if (Number(c.isActive) === 0) continue;
    const opt = document.createElement("option");
    opt.value = String(c.id);
    opt.textContent = c.nameAr || c.slug;
    sel.appendChild(opt);
  }
}

function fillSectionSelect(categoryId, preferredSectionId) {
  const sel = document.getElementById("product-section-id");
  if (!sel) return;
  sel.innerHTML = `<option value="">— بدون قسم فرعي —</option>`;
  if (!categoryId) {
    sel.disabled = true;
    fillSubsectionSelect(null);
    return;
  }
  sel.disabled = false;
  const cat = categoriesTree.find((c) => Number(c.id) === Number(categoryId));
  if (!cat?.sections?.length) {
    fillSubsectionSelect(null);
    return;
  }
  for (const s of cat.sections) {
    if (Number(s.isActive) === 0) continue;
    const opt = document.createElement("option");
    opt.value = String(s.id);
    opt.textContent = s.nameAr || s.slug;
    sel.appendChild(opt);
  }
  if (preferredSectionId != null && cat.sections.some((s) => Number(s.id) === Number(preferredSectionId))) {
    sel.value = String(preferredSectionId);
  }
  fillSubsectionSelect(sel.value ? Number(sel.value) : null);
}

function fillSubsectionSelect(sectionId, preferredSubId) {
  const sel = document.getElementById("product-subsection-id");
  if (!sel) return;
  sel.innerHTML = `<option value="">— بدون تصنيف فرعي —</option>`;
  if (!sectionId) {
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  let section = null;
  for (const c of categoriesTree) {
    section = c.sections?.find((s) => Number(s.id) === Number(sectionId));
    if (section) break;
  }
  if (!section?.subsections?.length) return;
  for (const sub of section.subsections) {
    if (Number(sub.isActive) === 0) continue;
    const opt = document.createElement("option");
    opt.value = String(sub.id);
    opt.textContent = sub.nameAr || sub.slug;
    sel.appendChild(opt);
  }
  if (preferredSubId != null && section.subsections.some((s) => Number(s.id) === Number(preferredSubId))) {
    sel.value = String(preferredSubId);
  }
}

function categorySlugById(categoryId) {
  const cat = categoriesTree.find((c) => Number(c.id) === Number(categoryId));
  return cat?.slug || "";
}

function syncSizeSetWrapVisibility() {
  const mode = document.getElementById("product-variant-mode")?.value || "none";
  const wrap = document.getElementById("product-size-set-wrap");
  if (!wrap) return;
  const show = mode === "size_only" || mode === "color_size";
  wrap.classList.toggle("hidden", !show);
}

function fillSizeSetSelect(preferredId) {
  const sel = document.getElementById("product-size-set-id");
  if (!sel) return;
  sel.innerHTML = `<option value="">— اختر مجموعة مقاسات —</option>`;
  for (const s of sizeSetsCache) {
    const opt = document.createElement("option");
    opt.value = String(s.id);
    opt.textContent = s.nameAr || s.slug;
    sel.appendChild(opt);
  }
  const pref = Number(preferredId);
  if (sizeSetsCache.some((s) => Number(s.id) === pref)) sel.value = String(pref);
}

async function refreshInventorySizes(setId) {
  await loadSizeLabelsForSetId(setId ? Number(setId) : null);
}

async function openModal(product) {
  const modal = document.getElementById("product-modal");
  const form = document.getElementById("product-form");
  const err = document.getElementById("product-form-error");
  if (!modal || !form) return;
  if (err) {
    err.textContent = "";
    err.classList.add("hidden");
  }
  form.reset();
  resetProductInventory();
  const idInput = document.getElementById("product-edit-id");
  const title = document.getElementById("product-modal-title");
  const finishOpen = async () => {
    modal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  };
  if (product) {
    if (idInput) idInput.value = String(product.id);
    if (title) title.textContent = "تعديل منتج";
    document.getElementById("product-name-ar").value = product.nameAr || "";
    document.getElementById("product-name-en").value = product.nameEn || "";
    document.getElementById("product-sku").value = product.sku || "";
    document.getElementById("product-price").value = String(product.priceIqd ?? 0);
    document.getElementById("product-stock").value = String(product.stock ?? 0);
    document.getElementById("product-image-url").value = product.imageUrl || "";
    document.getElementById("product-is-active").checked = product.isActive === 1 || product.isActive === true;
    fillCategorySelect();
    const catSel = document.getElementById("product-category-id");
    catSel.value = product.categoryId != null ? String(product.categoryId) : "";
    fillSectionSelect(product.categoryId, product.sectionId);
    const subSel = document.getElementById("product-subsection-id");
    if (product.subsectionId != null && subSel) subSel.value = String(product.subsectionId);
    fillSizeSetSelect(product.sizeSetId);
    syncSizeSetWrapVisibility();
    await refreshInventorySizes(product.sizeSetId);
    try {
      const inv = await fetchProductInventory(product.id);
      if (inv) setProductInventoryState(inv);
    } catch {
      setProductInventoryState({ variantMode: product.variantMode || "none", colors: [], variants: [] });
    }
    finishOpen();
  } else {
    if (idInput) idInput.value = "";
    if (title) title.textContent = "إضافة منتج";
    document.getElementById("product-is-active").checked = true;
    fillCategorySelect();
    fillSectionSelect(null);
    fillSubsectionSelect(null);
    fillSizeSetSelect(null);
    syncSizeSetWrapVisibility();
    setProductInventoryState({ variantMode: "none", colors: [], variants: [] });
    finishOpen();
  }
}

function closeModal() {
  const modal = document.getElementById("product-modal");
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
}

async function patchProduct(id, body) {
  await updateProduct(id, body);
}

async function reloadProducts() {
  productsCache = await fetchProductsList();
  renderTable();
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

  initProductInventoryPanel({
    root: document.getElementById("product-inventory-root"),
    modeSelect: document.getElementById("product-variant-mode"),
    stockWrap: document.getElementById("product-stock-wrap"),
  });
  resetProductInventory();

  document.getElementById("sidebar-add-product")?.addEventListener("click", () => openModal(null));
  document.getElementById("header-add-product")?.addEventListener("click", () => openModal(null));
  document.getElementById("product-modal-close")?.addEventListener("click", closeModal);
  document.getElementById("product-modal-close-2")?.addEventListener("click", closeModal);
  document.getElementById("product-modal-backdrop")?.addEventListener("click", closeModal);

  document.getElementById("product-category-id")?.addEventListener("change", (e) => {
    const v = e.target.value;
    fillSectionSelect(v ? Number(v) : null);
  });

  document.getElementById("product-variant-mode")?.addEventListener("change", () => {
    syncSizeSetWrapVisibility();
  });

  document.getElementById("product-size-set-id")?.addEventListener("change", async (e) => {
    const v = e.target.value;
    await refreshInventorySizes(v ? Number(v) : null);
  });

  document.getElementById("product-section-id")?.addEventListener("change", (e) => {
    const v = e.target.value;
    fillSubsectionSelect(v ? Number(v) : null);
  });

  document.getElementById("product-search")?.addEventListener("input", (e) => {
    searchQuery = e.target.value || "";
    renderTable();
  });

  document.getElementById("product-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("product-form-error");
    if (errEl) {
      errEl.textContent = "";
      errEl.classList.add("hidden");
    }
    const editId = document.getElementById("product-edit-id")?.value;
    const nameAr = document.getElementById("product-name-ar")?.value?.trim() || "";
    if (!nameAr) {
      if (errEl) {
        errEl.textContent = "اسم المنتج بالعربية مطلوب";
        errEl.classList.remove("hidden");
      }
      return;
    }
    const catVal = document.getElementById("product-category-id")?.value;
    const secVal = document.getElementById("product-section-id")?.value;
    const subVal = document.getElementById("product-subsection-id")?.value;
    const sizeSetVal = document.getElementById("product-size-set-id")?.value;
    const inventory = getProductInventoryPayload();
    if (inventory.variantMode !== "none") {
      if (inventory.variantMode === "color_only" || inventory.variantMode === "color_size") {
        const named = (inventory.colors || []).filter((c) => String(c.nameAr || "").trim());
        if (!named.length) {
          if (errEl) {
            errEl.textContent = "اختر لوناً واحداً على الأقل من لوحة الألوان";
            errEl.classList.remove("hidden");
          }
          return;
        }
      }
    }
    if (
      (inventory.variantMode === "size_only" || inventory.variantMode === "color_size") &&
      !sizeSetVal
    ) {
      if (errEl) {
        errEl.textContent = "اختر مجموعة المقاسات الجاهزة";
        errEl.classList.remove("hidden");
      }
      return;
    }
    const body = {
      id: editId ? Number(editId) : undefined,
      nameAr,
      nameEn: document.getElementById("product-name-en")?.value?.trim() || null,
      sku: document.getElementById("product-sku")?.value?.trim() || null,
      priceIqd: Number(document.getElementById("product-price")?.value) || 0,
      stock: Math.floor(Number(document.getElementById("product-stock")?.value) || 0),
      imageUrl: document.getElementById("product-image-url")?.value?.trim() || null,
      categoryId: catVal ? Number(catVal) : null,
      sectionId: secVal ? Number(secVal) : null,
      subsectionId: subVal ? Number(subVal) : null,
      isActive: document.getElementById("product-is-active")?.checked !== false,
      variantMode: inventory.variantMode,
      sizeSetId: sizeSetVal ? Number(sizeSetVal) : null,
    };
    try {
      await saveProductWithInventory(body, inventory);
      closeModal();
      await reloadProducts();
      const stats = await fetchProductsStats();
      if (stats) renderStats(stats);
    } catch (err) {
      if (errEl) {
        errEl.textContent = err instanceof Error ? err.message : "خطأ";
        errEl.classList.remove("hidden");
      }
    }
  });

  try {
    const [catTree, stats, prodList, sizeSets, colorPresetList] = await Promise.all([
      fetchCategoriesTree(true),
      fetchProductsStats(),
      fetchProductsList(),
      fetchSizeSets(true),
      fetchColorPresets(true),
    ]);
    if (catTree) categoriesTree = catTree;
    if (sizeSets) sizeSetsCache = sizeSets.map((s) => ({ id: s.id, nameAr: s.nameAr, slug: s.slug }));
    if (colorPresetList) setColorPresets(colorPresetList);
    if (stats) renderStats(stats);
    if (prodList) {
      productsCache = prodList;
      renderTable();
    }
  } catch {
    const tbody = document.getElementById("products-tbody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-error">تعذر تحميل البيانات من Supabase. نفّذ npm run db:push للهجرة 20260520140000.</td></tr>`;
    }
  }

  if (location.hash === "#add") openModal(null);
});
