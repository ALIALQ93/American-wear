import { getStorefrontSupabase } from "../lib/supabase/storefrontClient.js";
import { addToCart } from "./cartStore.js";
import { escapeHtml, formatIqd, parsePositiveInt } from "./storefrontCommon.js";

/** @typedef {{ id: number, colorId: number|null, sizeLabel: string|null, stock: number, sku: string|null }} VariantRow */
/** @typedef {{ id: number, nameAr: string, hexCode: string|null, imageUrl: string|null }} ColorRow */

let product = null;
/** @type {VariantRow[]} */
let variants = [];
/** @type {ColorRow[]} */
let colors = [];
let selectedColorId = null;
let selectedSize = null;
let qty = 1;

function paramsProductId() {
  return parsePositiveInt(new URLSearchParams(window.location.search).get("id"));
}

function variantLabel(v) {
  const color = colors.find((c) => c.id === v.colorId);
  const parts = [];
  if (color?.nameAr) parts.push(color.nameAr);
  if (v.sizeLabel) parts.push(v.sizeLabel);
  return parts.join(" / ");
}

function matchingVariant() {
  const mode = product?.variant_mode || "none";
  if (mode === "none") return variants[0] || null;
  if (mode === "size_only") {
    return variants.find((v) => v.sizeLabel === selectedSize) || null;
  }
  if (mode === "color_only") {
    return variants.find((v) => v.colorId === selectedColorId) || null;
  }
  if (mode === "color_size") {
    return variants.find((v) => v.colorId === selectedColorId && v.sizeLabel === selectedSize) || null;
  }
  return null;
}

function availableSizesForColor(colorId) {
  const mode = product?.variant_mode || "none";
  if (mode === "size_only") {
    return [...new Set(variants.map((v) => v.sizeLabel).filter(Boolean))];
  }
  if (mode === "color_size") {
    return [
      ...new Set(
        variants
          .filter((v) => v.colorId === colorId && v.stock > 0)
          .map((v) => v.sizeLabel)
          .filter(Boolean),
      ),
    ];
  }
  return [...new Set(variants.filter((v) => v.stock > 0).map((v) => v.sizeLabel).filter(Boolean))];
}

function stockForSelection() {
  const v = matchingVariant();
  return v ? v.stock : 0;
}

function mainImageUrl() {
  const color = colors.find((c) => c.id === selectedColorId);
  if (color?.imageUrl) return color.imageUrl;
  return product?.image_url || null;
}

function renderGallery() {
  const url = mainImageUrl();
  const img = url
    ? `<img src="${escapeHtml(url)}" alt="" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"/>`
    : `<div class="w-full h-full bg-gradient-to-br from-[#2a2a2a] to-[#0d0d0d]" aria-hidden="true"></div>`;
  return `<div class="border border-primary/20 aspect-[3/4] overflow-hidden group bg-surface-container">${img}</div>`;
}

function renderColorPicker() {
  const mode = product?.variant_mode;
  if (mode !== "color_only" && mode !== "color_size") return "";
  if (!colors.length) return "";
  const chips = colors
    .map((c) => {
      const on = selectedColorId === c.id;
      const hex = escapeHtml(c.hexCode || "#888");
      return `<button type="button" data-pick-color="${c.id}" class="w-12 h-12 rounded-full border-2 transition-all ${on ? "border-primary ring-2 ring-primary/40" : "border-outline-variant hover:border-primary"}" style="background-color:${hex}" title="${escapeHtml(c.nameAr)}"></button>`;
    })
    .join("");
  return `<div>
    <label class="font-label-md text-label-md text-on-surface mb-3 block">اللون</label>
    <div class="flex flex-wrap gap-3">${chips}</div>
  </div>`;
}

function renderSizePicker() {
  const mode = product?.variant_mode;
  if (mode !== "size_only" && mode !== "color_size") return "";
  const sizes =
    mode === "color_size"
      ? [...new Set(variants.map((v) => v.sizeLabel).filter(Boolean))]
      : availableSizesForColor(selectedColorId);
  if (!sizes.length) return "";
  const buttons = sizes
    .map((label) => {
      const v =
        mode === "color_size"
          ? variants.find((x) => x.colorId === selectedColorId && x.sizeLabel === label)
          : variants.find((x) => x.sizeLabel === label);
      const stock = v?.stock ?? 0;
      const on = selectedSize === label;
      const disabled = stock <= 0;
      const cls = disabled
        ? "opacity-30 cursor-not-allowed border-outline-variant"
        : on
          ? "border-primary bg-primary text-on-primary"
          : "border-outline-variant hover:border-primary text-on-surface-variant";
      return `<button type="button" data-pick-size="${escapeHtml(label)}" ${disabled ? "disabled" : ""} class="min-w-14 h-14 px-2 flex items-center justify-center border font-label-md text-label-md transition-colors ${cls}">${escapeHtml(label)}</button>`;
    })
    .join("");
  return `<div>
    <label class="font-label-md text-label-md text-on-surface mb-3 block">المقاس</label>
    <div class="flex flex-wrap gap-3">${buttons}</div>
  </div>`;
}

function renderStockBadge() {
  const stock = stockForSelection();
  if (!product) return "";
  if (product.variant_mode === "none" || variants.length === 1) {
    const total = variants.reduce((s, v) => s + v.stock, 0);
    return total > 0
      ? `<span class="font-label-md text-label-md px-3 py-1 bg-primary/10 text-primary border border-primary/20">متوفر (${total})</span>`
      : `<span class="font-label-md text-label-md px-3 py-1 bg-error/10 text-error border border-error/20">نفد المخزون</span>`;
  }
  if (!matchingVariant()) {
    return `<span class="font-label-md text-label-md px-3 py-1 bg-surface-container-high text-on-surface-variant border border-outline-variant">اختر الخيارات</span>`;
  }
  return stock > 0
    ? `<span class="font-label-md text-label-md px-3 py-1 bg-primary/10 text-primary border border-primary/20">متوفر (${stock})</span>`
    : `<span class="font-label-md text-label-md px-3 py-1 bg-error/10 text-error border border-error/20">نفد المخزون</span>`;
}

function renderPanel() {
  const root = document.getElementById("product-detail-root");
  if (!root || !product) return;
  const name = escapeHtml(product.name_ar || "");
  const sku = product.sku ? escapeHtml(product.sku) : "—";
  const price = formatIqd(product.price_iqd);
  const msg = document.getElementById("product-detail-msg");
  const msgHtml = msg && !msg.classList.contains("hidden") ? msg.outerHTML : `<p id="product-detail-msg" class="hidden text-label-sm mt-2"></p>`;

  root.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
      <div class="lg:col-span-7">${renderGallery()}</div>
      <div class="lg:col-span-5 lg:sticky lg:top-32">
        <div class="flex flex-col gap-8">
          <div>
            <h1 class="font-headline-md text-headline-md text-on-surface tracking-tight">${name}</h1>
            ${product.name_en ? `<p class="text-on-surface-variant text-label-md mt-2" dir="ltr">${escapeHtml(product.name_en)}</p>` : ""}
          </div>
          <div class="border-y border-outline-variant py-6 flex justify-between items-center gap-4 flex-wrap">
            <span class="font-display-lg text-display-lg text-primary">${escapeHtml(price)}</span>
            ${renderStockBadge()}
          </div>
          ${renderColorPicker()}
          ${renderSizePicker()}
          <div class="flex flex-col gap-4">
            <label class="font-label-md text-label-md text-on-surface">الكمية</label>
            <div class="flex gap-4 flex-wrap">
              <div class="flex items-center border border-outline-variant h-14 px-4 bg-surface-container-low">
                <button type="button" id="pd-qty-minus" class="text-primary hover:text-white transition-colors"><span class="material-symbols-outlined">remove</span></button>
                <span id="pd-qty-value" class="mx-6 font-label-md text-label-md min-w-[2ch] text-center">${qty}</span>
                <button type="button" id="pd-qty-plus" class="text-primary hover:text-white transition-colors"><span class="material-symbols-outlined">add</span></button>
              </div>
              <button type="button" id="pd-add-cart" class="flex-1 min-w-[12rem] bg-primary text-on-primary font-label-md text-label-md h-14 flex items-center justify-center gap-2 hover:bg-primary-container transition-all active:scale-95 duration-200">
                <span class="material-symbols-outlined">shopping_bag</span>
                إضافة إلى السلة
              </button>
            </div>
            ${msgHtml}
          </div>
          <div class="text-label-sm text-on-surface-variant">
            <span class="text-primary font-label-md">رقم المنتج:</span> <span class="font-mono dir-ltr">${sku}</span>
          </div>
        </div>
      </div>
    </div>
  `;
  bindHandlers();
}

function showMsg(text, isError) {
  const el = document.getElementById("product-detail-msg");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden", "text-primary", "text-error");
  el.classList.add(isError ? "text-error" : "text-primary");
}

function bindHandlers() {
  document.querySelectorAll("[data-pick-color]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedColorId = Number(btn.getAttribute("data-pick-color"));
      if (product?.variant_mode === "color_size") {
        const sizes = availableSizesForColor(selectedColorId);
        if (!sizes.includes(selectedSize)) selectedSize = sizes[0] || null;
      }
      qty = 1;
      renderPanel();
    });
  });
  document.querySelectorAll("[data-pick-size]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedSize = btn.getAttribute("data-pick-size");
      qty = 1;
      renderPanel();
    });
  });
  document.getElementById("pd-qty-minus")?.addEventListener("click", () => {
    qty = Math.max(1, qty - 1);
    renderPanel();
  });
  document.getElementById("pd-qty-plus")?.addEventListener("click", () => {
    const max = stockForSelection() || 99;
    qty = Math.min(max, qty + 1);
    renderPanel();
  });
  document.getElementById("pd-add-cart")?.addEventListener("click", () => {
    const v = matchingVariant();
    if (!v) {
      showMsg("اختر اللون والمقاس أولاً", true);
      return;
    }
    if (v.stock < 1) {
      showMsg("هذا الخيار غير متوفر حالياً", true);
      return;
    }
    if (qty > v.stock) {
      showMsg(`الكمية المتاحة ${v.stock} فقط`, true);
      return;
    }
    addToCart({
      variantId: v.id,
      productId: Number(product.id),
      nameAr: product.name_ar || "",
      imageUrl: mainImageUrl(),
      priceIqd: Number(product.price_iqd) || 0,
      qty,
      variantLabel: variantLabel(v),
    });
    showMsg("تمت الإضافة إلى السلة", false);
  });
}

function pickDefaults() {
  const mode = product?.variant_mode || "none";
  if (mode === "color_only" || mode === "color_size") {
    const first = colors.find((c) => variants.some((v) => v.colorId === c.id && v.stock > 0)) || colors[0];
    selectedColorId = first?.id ?? null;
  }
  if (mode === "size_only") {
    const first = variants.find((v) => v.stock > 0 && v.sizeLabel);
    selectedSize = first?.sizeLabel ?? variants[0]?.sizeLabel ?? null;
  }
  if (mode === "color_size") {
    const sizes = availableSizesForColor(selectedColorId);
    selectedSize = sizes[0] || null;
  }
}

async function main() {
  const root = document.getElementById("product-detail-root");
  const crumb = document.getElementById("pd-crumb-name");
  if (!root) return;

  const productId = paramsProductId();
  if (!productId) {
    root.innerHTML =
      '<p class="text-on-surface-variant">معرّف المنتج غير صالح. <a class="text-primary underline" href="./home.html">الرئيسية</a></p>';
    return;
  }

  const sb = getStorefrontSupabase();
  if (!sb) {
    root.innerHTML = '<p class="text-error">لم يُضبط Supabase في البناء.</p>';
    return;
  }

  const { data: prod, error: pErr } = await sb
    .from("products")
    .select("id,name_ar,name_en,price_iqd,image_url,sku,stock,variant_mode,is_active")
    .eq("id", productId)
    .eq("is_active", 1)
    .maybeSingle();

  if (pErr) {
    root.innerHTML = `<p class="text-error">${escapeHtml(pErr.message)}</p>`;
    return;
  }
  if (!prod) {
    root.innerHTML =
      '<p class="text-on-surface-variant">المنتج غير موجود أو غير متاح. <a class="text-primary underline" href="./home.html">الرئيسية</a></p>';
    return;
  }

  product = prod;
  if (crumb) crumb.textContent = prod.name_ar || "المنتج";

  const [{ data: colorRows }, { data: variantRows }] = await Promise.all([
    sb
      .from("product_colors")
      .select("id,name_ar,hex_code,image_url,sort_order")
      .eq("product_id", productId)
      .eq("is_active", 1)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    sb
      .from("product_variants")
      .select("id,color_id,size_label,stock,sku")
      .eq("product_id", productId)
      .eq("is_active", 1)
      .order("id", { ascending: true }),
  ]);

  colors = (colorRows || []).map((c) => ({
    id: Number(c.id),
    nameAr: c.name_ar || "",
    hexCode: c.hex_code,
    imageUrl: c.image_url,
  }));
  variants = (variantRows || []).map((v) => ({
    id: Number(v.id),
    colorId: v.color_id != null ? Number(v.color_id) : null,
    sizeLabel: v.size_label ?? null,
    stock: Number(v.stock) || 0,
    sku: v.sku ?? null,
  }));

  pickDefaults();
  renderPanel();
}

document.addEventListener("DOMContentLoaded", main);
