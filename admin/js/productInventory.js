import { fetchSizesList } from "./adminSupabaseData.js";

/** @typedef {{ nameAr: string, nameEn?: string|null, hexCode?: string|null, imageUrl?: string|null }} ColorDraft */
/** @typedef {{ colorIndex?: number|null, sizeLabel?: string|null, sku?: string|null, stock: number }} VariantDraft */

let rootEl = null;
let modeSelect = null;
let stockWrap = null;
let variantMode = "none";
/** @type {ColorDraft[]} */
let colors = [];
/** @type {VariantDraft[]} */
let variants = [];
/** @type {string[]} */
let sizeLabels = [];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stockForSize(label) {
  const v = variants.find((x) => x.sizeLabel === label && x.colorIndex == null);
  return v ? v.stock : 0;
}

function stockForColor(idx) {
  const v = variants.find((x) => x.colorIndex === idx && !x.sizeLabel);
  return v ? v.stock : 0;
}

function stockForColorSize(colorIdx, sizeLabel) {
  const v = variants.find((x) => x.colorIndex === colorIdx && x.sizeLabel === sizeLabel);
  return v ? v.stock : 0;
}

function setStockSize(label, stock) {
  variants = variants.filter((x) => !(x.sizeLabel === label && x.colorIndex == null));
  const n = Math.max(0, Math.floor(Number(stock) || 0));
  if (n > 0 || label) variants.push({ colorIndex: null, sizeLabel: label, stock: n, sku: null });
}

function setStockColor(idx, stock) {
  variants = variants.filter((x) => !(x.colorIndex === idx && !x.sizeLabel));
  const n = Math.max(0, Math.floor(Number(stock) || 0));
  variants.push({ colorIndex: idx, sizeLabel: null, stock: n, sku: null });
}

function setStockColorSize(colorIdx, sizeLabel, stock) {
  variants = variants.filter((x) => !(x.colorIndex === colorIdx && x.sizeLabel === sizeLabel));
  const n = Math.max(0, Math.floor(Number(stock) || 0));
  variants.push({ colorIndex: colorIdx, sizeLabel, stock: n, sku: null });
}

function renderSizeOnly() {
  if (!sizeLabels.length) {
    return `<p class="text-label-sm text-on-surface-variant">لا توجد قوالب مقاسات لهذا التصنيف. أضفها من صفحة <a href="./sizes.html" class="text-primary underline">المقاسات</a> (حقل category = slug التصنيف).</p>`;
  }
  const rows = sizeLabels
    .map(
      (label) => `
    <div class="flex items-center gap-3 py-2 border-b border-outline-variant/40">
      <span class="w-16 text-label-md text-on-surface font-mono">${escapeHtml(label)}</span>
      <input type="number" min="0" step="1" data-size-stock="${escapeHtml(label)}" value="${stockForSize(label)}" class="flex-1 bg-surface-container border border-outline-variant px-3 py-2 text-on-surface focus:border-primary outline-none" placeholder="المخزون"/>
    </div>`,
    )
    .join("");
  return `<div class="space-y-1"><p class="text-label-sm text-on-surface-variant mb-2">أدخل المخزون لكل مقاس (نفس السعر للجميع).</p>${rows}</div>`;
}

function renderColorCard(idx, c) {
  const sizesBlock =
    variantMode === "color_size" && sizeLabels.length
      ? `<div class="mt-3 space-y-2">
        <p class="text-label-sm text-primary">مخزون كل مقاس</p>
        ${sizeLabels
          .map(
            (label) => `
          <div class="flex items-center gap-2">
            <span class="w-12 text-label-sm font-mono text-on-surface-variant">${escapeHtml(label)}</span>
            <input type="number" min="0" step="1" data-color-size-stock="${idx}|${escapeHtml(label)}" value="${stockForColorSize(idx, label)}" class="flex-1 bg-surface-container border border-outline-variant px-2 py-1.5 text-on-surface text-sm focus:border-primary outline-none"/>
          </div>`,
          )
          .join("")}
      </div>`
      : variantMode === "color_only"
        ? `<div class="mt-3">
          <label class="text-label-sm text-on-surface-variant">المخزون</label>
          <input type="number" min="0" step="1" data-color-stock="${idx}" value="${stockForColor(idx)}" class="w-full mt-1 bg-surface-container border border-outline-variant px-3 py-2 text-on-surface focus:border-primary outline-none"/>
        </div>`
        : "";
  return `
    <div class="border border-outline-variant rounded-lg p-4 bg-surface-container/40" data-color-idx="${idx}">
      <div class="flex justify-between items-start gap-2 mb-3">
        <span class="text-label-sm text-primary">لون ${idx + 1}</span>
        <button type="button" class="text-error text-label-sm hover:underline js-inv-remove-color" data-idx="${idx}">حذف</button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="text-label-sm text-on-surface-variant">الاسم بالعربية *</label>
          <input type="text" data-color-name-ar="${idx}" value="${escapeHtml(c.nameAr || "")}" class="w-full mt-1 bg-surface-container border border-outline-variant px-3 py-2 text-on-surface focus:border-primary outline-none"/>
        </div>
        <div>
          <label class="text-label-sm text-on-surface-variant">كود اللون</label>
          <input type="text" dir="ltr" data-color-hex="${idx}" value="${escapeHtml(c.hexCode || "")}" placeholder="#000000" class="w-full mt-1 bg-surface-container border border-outline-variant px-3 py-2 text-on-surface focus:border-primary outline-none font-mono text-sm"/>
        </div>
      </div>
      <div class="mt-3">
        <label class="text-label-sm text-on-surface-variant">رابط صورة اللون</label>
        <input type="url" dir="ltr" data-color-image="${idx}" value="${escapeHtml(c.imageUrl || "")}" placeholder="https://..." class="w-full mt-1 bg-surface-container border border-outline-variant px-3 py-2 text-on-surface focus:border-primary outline-none text-left text-sm"/>
      </div>
      ${sizesBlock}
    </div>`;
}

function renderColorModes() {
  const cards = colors.map((c, i) => renderColorCard(i, c)).join("");
  const addBtn = `<button type="button" id="inv-add-color" class="mt-3 px-3 py-2 text-label-sm border border-primary/40 text-primary hover:bg-primary/10">+ إضافة لون</button>`;
  const sizeHint =
    variantMode === "color_size" && !sizeLabels.length
      ? `<p class="text-label-sm text-error mb-2">أضف قوالب مقاسات لـ slug التصنيف أولاً.</p>`
      : "";
  return `${sizeHint}<div class="space-y-4">${cards || `<p class="text-label-sm text-on-surface-variant">أضف لوناً واحداً على الأقل.</p>`}</div>${addBtn}`;
}

function renderPanel() {
  if (!rootEl) return;
  if (variantMode === "none") {
    rootEl.innerHTML = `<p class="text-label-sm text-on-surface-variant">مخزون بسيط — استخدم حقل «المخزون» أعلاه.</p>`;
    if (stockWrap) stockWrap.classList.remove("hidden");
    return;
  }
  if (stockWrap) stockWrap.classList.add("hidden");
  if (variantMode === "size_only") {
    rootEl.innerHTML = renderSizeOnly();
  } else {
    rootEl.innerHTML = renderColorModes();
  }
  bindPanelHandlers();
}

function syncColorsFromDom() {
  if (!rootEl) return;
  colors = colors.map((c, idx) => {
    const nameAr = rootEl.querySelector(`[data-color-name-ar="${idx}"]`)?.value?.trim() || c.nameAr || "";
    const hexCode = rootEl.querySelector(`[data-color-hex="${idx}"]`)?.value?.trim() || c.hexCode || "";
    const imageUrl = rootEl.querySelector(`[data-color-image="${idx}"]`)?.value?.trim() || c.imageUrl || "";
    return { ...c, nameAr, hexCode, imageUrl };
  });
}

function syncVariantsFromDom() {
  if (!rootEl) return;
  if (variantMode === "size_only") {
    variants = [];
    rootEl.querySelectorAll("[data-size-stock]").forEach((el) => {
      const label = el.getAttribute("data-size-stock");
      if (!label) return;
      setStockSize(label, el.value);
    });
    return;
  }
  syncColorsFromDom();
  variants = [];
  if (variantMode === "color_only") {
    colors.forEach((_, idx) => {
      const el = rootEl.querySelector(`[data-color-stock="${idx}"]`);
      setStockColor(idx, el?.value ?? 0);
    });
  } else if (variantMode === "color_size") {
    rootEl.querySelectorAll("[data-color-size-stock]").forEach((el) => {
      const key = el.getAttribute("data-color-size-stock");
      if (!key) return;
      const [ci, label] = key.split("|");
      setStockColorSize(Number(ci), label, el.value);
    });
  }
}

function bindPanelHandlers() {
  if (!rootEl) return;
  rootEl.querySelectorAll("[data-size-stock]").forEach((el) => {
    el.addEventListener("input", () => syncVariantsFromDom());
  });
  rootEl.querySelectorAll("[data-color-stock], [data-color-size-stock]").forEach((el) => {
    el.addEventListener("input", () => syncVariantsFromDom());
  });
  rootEl.querySelectorAll(".js-inv-remove-color").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncColorsFromDom();
      syncVariantsFromDom();
      const idx = Number(btn.getAttribute("data-idx"));
      colors.splice(idx, 1);
      const remapped = [];
      for (const v of variants) {
        if (v.colorIndex == null) {
          remapped.push(v);
          continue;
        }
        if (v.colorIndex === idx) continue;
        remapped.push({ ...v, colorIndex: v.colorIndex > idx ? v.colorIndex - 1 : v.colorIndex });
      }
      variants = remapped;
      renderPanel();
    });
  });
  document.getElementById("inv-add-color")?.addEventListener("click", () => {
    syncColorsFromDom();
    syncVariantsFromDom();
    colors.push({ nameAr: "", hexCode: "", imageUrl: "" });
    renderPanel();
  });
}

export function initProductInventoryPanel(options) {
  rootEl = options.root;
  modeSelect = options.modeSelect;
  stockWrap = options.stockWrap;
  if (modeSelect) {
    modeSelect.addEventListener("change", () => {
      syncVariantsFromDom();
      variantMode = modeSelect.value || "none";
      if ((variantMode === "color_only" || variantMode === "color_size") && !colors.length) {
        colors = [{ nameAr: "", hexCode: "", imageUrl: "" }];
      }
      renderPanel();
    });
  }
}

export async function loadSizeLabelsForCategorySlug(slug) {
  const list = slug ? await fetchSizesList(slug) : [];
  sizeLabels = (list || [])
    .filter((r) => r.isActive === 1 || r.isActive === true)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((r) => r.label);
  renderPanel();
}

export function setProductInventoryState(state) {
  variantMode = state?.variantMode || "none";
  colors = (state?.colors || []).map((c) => ({
    nameAr: c.nameAr || "",
    nameEn: c.nameEn ?? null,
    hexCode: c.hexCode ?? null,
    imageUrl: c.imageUrl ?? null,
  }));
  variants = (state?.variants || []).map((v) => ({
    colorIndex: v.colorIndex ?? null,
    sizeLabel: v.sizeLabel ?? null,
    sku: v.sku ?? null,
    stock: Number(v.stock) || 0,
  }));
  if (modeSelect) modeSelect.value = variantMode;
  if ((variantMode === "color_only" || variantMode === "color_size") && !colors.length) {
    colors = [{ nameAr: "", hexCode: "", imageUrl: "" }];
  }
  renderPanel();
}

export function getProductInventoryPayload() {
  syncVariantsFromDom();
  const mode = modeSelect?.value || variantMode || "none";
  if (mode === "none") {
    const stockEl = document.getElementById("product-stock");
    const skuEl = document.getElementById("product-sku");
    const stock = Math.max(0, Math.floor(Number(stockEl?.value) || 0));
    const sku = skuEl?.value?.trim() || null;
    return {
      variantMode: "none",
      colors: [],
      variants: [{ colorIndex: null, sizeLabel: null, stock, sku }],
    };
  }
  return { variantMode: mode, colors, variants };
}

export function resetProductInventory() {
  variantMode = "none";
  colors = [];
  variants = [];
  sizeLabels = [];
  if (modeSelect) modeSelect.value = "none";
  renderPanel();
}
