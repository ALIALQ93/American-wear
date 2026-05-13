import { fetchSizeSetLabels, adjustVariantStock } from "./adminSupabaseData.js";

/** @typedef {{ id?: number, presetId?: number|null, nameAr: string, nameEn?: string|null, hexCode?: string|null, imageUrl?: string|null }} ColorDraft */
/** @typedef {{ id: number, nameAr: string, nameEn?: string|null, hexCode: string }} ColorPreset */
/** @typedef {{ id?: number, colorIndex?: number|null, sizeLabel?: string|null, sku?: string|null, stock: number }} VariantDraft */

let rootEl = null;
let modeSelect = null;
let stockWrap = null;
let stockAdjustEl = null;
let variantMode = "none";
/** @type {number|null} */
let editingProductId = null;
/** @type {ColorDraft[]} */
let colors = [];
/** @type {VariantDraft[]} */
let variants = [];
/** @type {string[]} */
let sizeLabels = [];
/** @type {ColorPreset[]} */
let colorPresets = [];
/** @type {((msg: string) => void)|null} */
let onStockMessage = null;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isColorSelected(presetId) {
  return colors.some((c) => Number(c.presetId) === Number(presetId));
}

function isEditing() {
  return editingProductId != null && Number.isFinite(Number(editingProductId));
}

function variantIdForSize(label) {
  return variants.find((x) => x.sizeLabel === label && x.colorIndex == null)?.id;
}

function variantIdForColor(idx) {
  return variants.find((x) => x.colorIndex === idx && !x.sizeLabel)?.id;
}

function variantIdForColorSize(colorIdx, sizeLabel) {
  return variants.find((x) => x.colorIndex === colorIdx && x.sizeLabel === sizeLabel)?.id;
}

function renderStockField(variantId, currentStock, inputAttrs) {
  if (isEditing() && variantId) {
    return `<div class="flex flex-wrap items-center gap-2" data-stock-control="${variantId}">
      <span class="font-mono text-on-surface min-w-[2.5rem] text-center js-stock-display">${currentStock}</span>
      <input type="number" min="1" step="1" value="1" class="w-16 bg-surface-container border border-outline-variant px-2 py-1.5 text-sm focus:border-primary outline-none js-stock-qty" data-variant-id="${variantId}"/>
      <button type="button" class="px-2.5 py-1.5 rounded bg-primary/15 text-primary text-label-sm hover:bg-primary/25 js-stock-add" data-variant-id="${variantId}" title="إضافة للمخزون">+</button>
      <button type="button" class="px-2.5 py-1.5 rounded bg-error/10 text-error text-label-sm hover:bg-error/20 js-stock-sub" data-variant-id="${variantId}" title="خصم من المخزون">−</button>
    </div>`;
  }
  return `<input type="number" min="0" step="1" ${inputAttrs} value="${currentStock}" class="w-full max-w-[120px] bg-surface-container border border-outline-variant px-2 py-1.5 focus:border-primary outline-none"/>`;
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
  const existing = variants.find((x) => x.sizeLabel === label && x.colorIndex == null);
  variants = variants.filter((x) => !(x.sizeLabel === label && x.colorIndex == null));
  const n = Math.max(0, Math.floor(Number(stock) || 0));
  if (n > 0 || label) {
    variants.push({ id: existing?.id, colorIndex: null, sizeLabel: label, stock: n, sku: existing?.sku ?? null });
  }
}

function setStockColor(idx, stock) {
  const existing = variants.find((x) => x.colorIndex === idx && !x.sizeLabel);
  variants = variants.filter((x) => !(x.colorIndex === idx && !x.sizeLabel));
  const n = Math.max(0, Math.floor(Number(stock) || 0));
  variants.push({ id: existing?.id, colorIndex: idx, sizeLabel: null, stock: n, sku: existing?.sku ?? null });
}

function setStockColorSize(colorIdx, sizeLabel, stock) {
  const existing = variants.find((x) => x.colorIndex === colorIdx && x.sizeLabel === sizeLabel);
  variants = variants.filter((x) => !(x.colorIndex === colorIdx && x.sizeLabel === sizeLabel));
  const n = Math.max(0, Math.floor(Number(stock) || 0));
  variants.push({ id: existing?.id, colorIndex: colorIdx, sizeLabel, stock: n, sku: existing?.sku ?? null });
}

function renderPalettePicker() {
  if (!colorPresets.length) {
    return `<p class="text-label-sm text-on-surface-variant mb-3">لا توجد ألوان جاهزة. أضفها من <a href="./colors.html" class="text-primary underline">صفحة الألوان</a>.</p>`;
  }
  const chips = colorPresets
    .map((p) => {
      const on = isColorSelected(p.id);
      const hex = escapeHtml(p.hexCode || "#888");
      return `<button type="button" class="js-pick-preset inline-flex items-center gap-2 px-3 py-2 rounded-full border transition-all ${on ? "border-primary bg-primary/15 ring-2 ring-primary/50" : "border-outline-variant hover:border-primary"}" data-preset-id="${p.id}" title="${escapeHtml(p.nameAr)}">
        <span class="w-6 h-6 rounded-full border border-outline-variant shrink-0" style="background-color:${hex}"></span>
        <span class="text-label-sm text-on-surface">${escapeHtml(p.nameAr)}</span>
      </button>`;
    })
    .join("");
  return `<div class="mb-4">
    <p class="text-label-sm text-on-surface-variant mb-2">اختر الألوان المتاحة لهذا المنتج (انقر للإضافة/الإزالة):</p>
    <div class="flex flex-wrap gap-2">${chips}</div>
  </div>`;
}

function renderSizeMatrixForColor(idx, c) {
  const hex = escapeHtml(c.hexCode || "#888");
  const title = escapeHtml(c.nameAr || `لون ${idx + 1}`);
  const sizesBlock =
    variantMode === "color_size" && sizeLabels.length
      ? `<div class="mt-3 overflow-x-auto">
        <table class="w-full text-sm min-w-[280px]">
          <thead><tr class="text-label-sm text-primary border-b border-outline-variant">
            <th class="py-2 text-right">المقاس</th>
            <th class="py-2 text-right">المخزون</th>
          </tr></thead>
          <tbody>
            ${sizeLabels
              .map(
                (label) => `
              <tr class="border-b border-outline-variant/30">
                <td class="py-2 font-mono text-on-surface">${escapeHtml(label)}</td>
                <td class="py-2">
                  ${renderStockField(variantIdForColorSize(idx, label), stockForColorSize(idx, label), `data-color-size-stock="${idx}|${escapeHtml(label)}"`)}
                </td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>`
      : variantMode === "color_only"
        ? `<div class="mt-3 max-w-xs">
          <label class="text-label-sm text-on-surface-variant">المخزون الكلي لهذا اللون</label>
          <div class="mt-1">${renderStockField(variantIdForColor(idx), stockForColor(idx), `data-color-stock="${idx}"`)}</div>
        </div>`
        : "";
  return `
    <div class="border border-outline-variant rounded-lg p-4 bg-surface-container/40" data-color-idx="${idx}">
      <div class="flex items-center gap-3 mb-3">
        <span class="w-10 h-10 rounded-full border border-outline-variant shrink-0" style="background-color:${hex}"></span>
        <div class="flex-1 min-w-0">
          <p class="font-body-md text-on-surface">${title}</p>
          <p class="text-label-sm text-on-surface-variant font-mono dir-ltr">${hex}</p>
        </div>
        <button type="button" class="text-error text-label-sm hover:underline js-inv-remove-color" data-idx="${idx}">إزالة</button>
      </div>
      <div>
        <label class="text-label-sm text-on-surface-variant">رابط صورة هذا اللون</label>
        <input type="url" dir="ltr" data-color-image="${idx}" value="${escapeHtml(c.imageUrl || "")}" placeholder="https://..." class="w-full mt-1 bg-surface-container border border-outline-variant px-3 py-2 text-sm text-left focus:border-primary outline-none"/>
      </div>
      ${sizesBlock}
    </div>`;
}

function renderSizeOnly() {
  if (!sizeLabels.length) {
    return `<p class="text-label-sm text-on-surface-variant">اختر <strong class="text-on-surface">مجموعة مقاسات</strong> من القائمة أعلاه.</p>`;
  }
  const rows = sizeLabels
    .map(
      (label) => `
    <div class="flex items-center gap-3 py-2 border-b border-outline-variant/40">
      <span class="w-16 text-label-md font-mono text-on-surface">${escapeHtml(label)}</span>
      ${renderStockField(variantIdForSize(label), stockForSize(label), `data-size-stock="${escapeHtml(label)}"`)}
    </div>`,
    )
    .join("");
  return `<div class="space-y-1"><p class="text-label-sm text-on-surface-variant mb-2">مخزون كل مقاس (نفس السعر للجميع).</p>${rows}</div>`;
}

function renderColorModes() {
  const palette = renderPalettePicker();
  const sizeHint =
    variantMode === "color_size" && !sizeLabels.length
      ? `<p class="text-label-sm text-error mb-2">اختر مجموعة مقاسات أولاً لربط المخزون بكل لون × مقاس.</p>`
      : variantMode === "color_size" && sizeLabels.length && colors.length
        ? `<p class="text-label-sm text-primary mb-3">أدخل المخزون لكل <strong>لون × مقاس</strong> في الجدول أدناه.</p>`
        : "";
  const cards = colors.map((c, i) => renderSizeMatrixForColor(i, c)).join("");
  const empty =
    colors.length === 0
      ? `<p class="text-label-sm text-on-surface-variant py-4 text-center border border-dashed border-outline-variant rounded">لم تُختر ألوان بعد — انقر على الألوان أعلاه.</p>`
      : "";
  return `${palette}${sizeHint}<div class="space-y-4">${cards}${empty}</div>`;
}

function togglePreset(presetId) {
  syncColorsFromDom();
  syncVariantsFromDom();
  const pid = Number(presetId);
  const preset = colorPresets.find((p) => Number(p.id) === pid);
  if (!preset) return;
  const existingIdx = colors.findIndex((c) => Number(c.presetId) === pid);
  if (existingIdx >= 0) {
    colors.splice(existingIdx, 1);
    const remapped = [];
    for (const v of variants) {
      if (v.colorIndex == null) {
        remapped.push(v);
        continue;
      }
      if (v.colorIndex === existingIdx) continue;
      remapped.push({ ...v, colorIndex: v.colorIndex > existingIdx ? v.colorIndex - 1 : v.colorIndex });
    }
    variants = remapped;
  } else {
    colors.push({
      presetId: pid,
      nameAr: preset.nameAr,
      nameEn: preset.nameEn ?? null,
      hexCode: preset.hexCode,
      imageUrl: "",
    });
  }
  renderPanel();
}

function renderSimpleStockControls() {
  const stockEl = document.getElementById("product-stock");
  const adjustRoot = document.getElementById("product-stock-adjust");
  if (!stockEl) return;
  if (isEditing() && variants[0]?.id) {
    stockEl.readOnly = true;
    stockEl.classList.add("bg-surface-container-high", "cursor-default");
    stockEl.value = String(variants[0].stock ?? 0);
    if (adjustRoot) {
      const vid = variants[0].id;
      adjustRoot.innerHTML = `<p class="text-label-sm text-on-surface-variant mb-2">إضافة توريد أو خصم يدوي:</p>
        <div class="flex flex-wrap items-center gap-2" data-stock-control="${vid}">
          <input type="number" min="1" step="1" value="1" class="w-16 bg-surface-container border border-outline-variant px-2 py-1.5 text-sm focus:border-primary outline-none js-stock-qty" data-variant-id="${vid}"/>
          <button type="button" class="px-3 py-1.5 rounded bg-primary/15 text-primary text-label-sm hover:bg-primary/25 js-stock-add" data-variant-id="${vid}">+ إضافة</button>
          <button type="button" class="px-3 py-1.5 rounded bg-error/10 text-error text-label-sm hover:bg-error/20 js-stock-sub" data-variant-id="${vid}">− خصم</button>
        </div>`;
      bindStockAdjustHandlers(adjustRoot);
    }
  } else {
    stockEl.readOnly = false;
    stockEl.classList.remove("bg-surface-container-high", "cursor-default");
    if (adjustRoot) adjustRoot.innerHTML = "";
  }
}

async function applyStockDelta(variantId, direction) {
  const vid = Number(variantId);
  if (!vid) return;
  const scope = rootEl || document;
  const qtyEl = scope.querySelector(`.js-stock-qty[data-variant-id="${vid}"]`) || document.querySelector(`.js-stock-qty[data-variant-id="${vid}"]`);
  const qty = Math.floor(Number(qtyEl?.value) || 0);
  if (qty < 1) {
    onStockMessage?.("أدخل كمية أكبر من صفر");
    return;
  }
  try {
    const next = await adjustVariantStock(vid, qty, direction === "sub" ? "adjustment_down" : "restock");
    const v = variants.find((x) => Number(x.id) === vid);
    if (v) v.stock = next;
    scope.querySelectorAll(`.js-stock-display`).forEach((el) => {
      const parent = el.closest(`[data-stock-control="${vid}"]`);
      if (parent) el.textContent = String(next);
    });
    const stockEl = document.getElementById("product-stock");
    if (stockEl && variantMode === "none") stockEl.value = String(next);
    onStockMessage?.(direction === "sub" ? `تم خصم ${qty} — المتبقي ${next}` : `تمت إضافة ${qty} — الإجمالي ${next}`);
  } catch (e) {
    onStockMessage?.(e?.message || "تعذر تعديل المخزون");
  }
}

function bindStockAdjustHandlers(container) {
  const root = container || rootEl;
  if (!root) return;
  root.querySelectorAll(".js-stock-add").forEach((btn) => {
    btn.addEventListener("click", () => applyStockDelta(btn.getAttribute("data-variant-id"), "add"));
  });
  root.querySelectorAll(".js-stock-sub").forEach((btn) => {
    btn.addEventListener("click", () => applyStockDelta(btn.getAttribute("data-variant-id"), "sub"));
  });
}

function renderPanel() {
  if (!rootEl) return;
  if (variantMode === "none") {
    rootEl.innerHTML = isEditing()
      ? `<p class="text-label-sm text-on-surface-variant">مخزون بسيط — عدّل الكمية بأزرار الإضافة/الخصم أعلاه.</p>`
      : `<p class="text-label-sm text-on-surface-variant">مخزون بسيط — أدخل الكمية الأولية في حقل «المخزون» أعلاه.</p>`;
    if (stockWrap) stockWrap.classList.remove("hidden");
    renderSimpleStockControls();
    return;
  }
  if (stockWrap) stockWrap.classList.add("hidden");
  const adjustRoot = document.getElementById("product-stock-adjust");
  if (adjustRoot) adjustRoot.innerHTML = "";
  const stockEl = document.getElementById("product-stock");
  if (stockEl) {
    stockEl.readOnly = false;
    stockEl.classList.remove("bg-surface-container-high", "cursor-default");
  }
  if (variantMode === "size_only") {
    rootEl.innerHTML = isEditing()
      ? `<p class="text-label-sm text-on-surface-variant mb-3">المخزون الحالي لكل مقاس — استخدم + للتوريد و − للخصم اليدوي.</p>${renderSizeOnly()}`
      : renderSizeOnly();
  } else {
    rootEl.innerHTML = renderColorModes();
  }
  bindPanelHandlers();
}

function syncColorsFromDom() {
  if (!rootEl) return;
  colors = colors.map((c, idx) => {
    const imageUrl = rootEl.querySelector(`[data-color-image="${idx}"]`)?.value?.trim() || c.imageUrl || "";
    return { ...c, imageUrl };
  });
}

function syncVariantsFromDom() {
  if (!rootEl || isEditing()) return;
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
  rootEl.querySelectorAll(".js-pick-preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pid = btn.getAttribute("data-preset-id");
      if (pid) togglePreset(pid);
    });
  });
  rootEl.querySelectorAll(".js-inv-remove-color").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      const c = colors[idx];
      if (c?.presetId != null) {
        togglePreset(c.presetId);
        return;
      }
      syncColorsFromDom();
      syncVariantsFromDom();
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
  bindStockAdjustHandlers();
}

export function initProductInventoryPanel(options) {
  rootEl = options.root;
  modeSelect = options.modeSelect;
  stockWrap = options.stockWrap;
  onStockMessage = typeof options.onStockMessage === "function" ? options.onStockMessage : null;
  if (modeSelect) {
    modeSelect.addEventListener("change", () => {
      syncVariantsFromDom();
      variantMode = modeSelect.value || "none";
      renderPanel();
    });
  }
}

export function setColorPresets(presets) {
  colorPresets = Array.isArray(presets) ? presets : [];
  renderPanel();
}

export async function loadSizeLabelsForSetId(setId) {
  if (!setId) {
    sizeLabels = [];
    renderPanel();
    return;
  }
  const list = await fetchSizeSetLabels(setId);
  sizeLabels = list || [];
  renderPanel();
}

export function setEditingProductId(id) {
  editingProductId = id != null && id !== "" ? Number(id) : null;
  renderPanel();
}

export function setProductInventoryState(state) {
  variantMode = state?.variantMode || "none";
  colors = (state?.colors || []).map((c) => ({
    presetId: c.presetId ?? null,
    nameAr: c.nameAr || "",
    nameEn: c.nameEn ?? null,
    hexCode: c.hexCode ?? null,
    imageUrl: c.imageUrl ?? null,
  }));
  variants = (state?.variants || []).map((v) => ({
    id: v.id != null ? Number(v.id) : undefined,
    colorIndex: v.colorIndex ?? null,
    sizeLabel: v.sizeLabel ?? null,
    sku: v.sku ?? null,
    stock: Number(v.stock) || 0,
  }));
  if (modeSelect) modeSelect.value = variantMode;
  renderPanel();
}

export function getProductInventoryPayload() {
  syncColorsFromDom();
  if (!isEditing()) syncVariantsFromDom();
  const mode = modeSelect?.value || variantMode || "none";
  if (mode === "none") {
    const skuEl = document.getElementById("product-sku");
    const sku = skuEl?.value?.trim() || null;
    const v = variants[0];
    const stock = isEditing()
      ? Math.max(0, Number(v?.stock) || 0)
      : Math.max(0, Math.floor(Number(document.getElementById("product-stock")?.value) || 0));
    return {
      variantMode: "none",
      colors: [],
      variants: [{ id: v?.id, colorIndex: null, sizeLabel: null, stock, sku }],
    };
  }
  return { variantMode: mode, colors, variants };
}

export function resetProductInventory() {
  editingProductId = null;
  variantMode = "none";
  colors = [];
  variants = [];
  sizeLabels = [];
  if (modeSelect) modeSelect.value = "none";
  renderPanel();
}
