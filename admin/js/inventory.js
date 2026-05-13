import { getAdminToken } from "./session.js";
import {
  isSupabaseAuthConfigured,
  syncAdminTokenFromSupabaseSession,
  clearAdminSessionAndSupabase,
} from "./supabaseAuth.js";
import {
  fetchColorPresets,
  fetchProductInventory,
  fetchProductsList,
  fetchSizeSets,
  saveProductInventory,
  updateProduct,
} from "./adminSupabaseData.js";
import {
  getProductInventoryPayload,
  initProductInventoryPanel,
  loadSizeLabelsForSetId,
  resetProductInventory,
  setColorPresets,
  setEditingProductId,
  setProductInventoryState,
} from "./productInventory.js";

/** @type {{ id: number, nameAr: string, nameEn?: string|null, sku?: string|null, stock: number, variantMode?: string, sizeSetId?: number|null }[]} */
let productsCache = [];
let searchQuery = "";
/** @type {number|null} */
let activeProductId = null;

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

function variantModeLabel(mode) {
  const m = {
    none: "منتج واحد",
    size_only: "مقاسات",
    color_only: "ألوان",
    color_size: "لون + مقاس",
  };
  return m[String(mode || "none")] || mode;
}

function filterProducts() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return productsCache;
  return productsCache.filter((p) => {
    const blob = [p.nameAr, p.nameEn, p.sku].filter(Boolean).join(" ").toLowerCase();
    return blob.includes(q);
  });
}

function renderList() {
  const root = document.getElementById("inventory-list-root");
  if (!root) return;
  const rows = filterProducts();
  if (!rows.length) {
    root.innerHTML = `<p class="text-on-surface-variant text-center py-12 border border-dashed border-outline-variant rounded-lg">لا توجد منتجات. أضف منتجات من <a href="./products.html" class="text-primary underline">صفحة المنتجات</a> أولاً.</p>`;
    return;
  }
  root.innerHTML = `
    <div class="overflow-x-auto border border-outline-variant rounded-lg bg-surface-container-low">
      <table class="w-full text-right min-w-[640px]">
        <thead>
          <tr class="text-label-md text-primary border-b border-outline-variant bg-surface-container-high/50">
            <th class="px-6 py-3">المنتج</th>
            <th class="px-6 py-3">نوع المخزون</th>
            <th class="px-6 py-3">الكمية</th>
            <th class="px-6 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-outline-variant/40">
          ${rows
            .map(
              (p) => `
            <tr class="hover:bg-surface-container-highest/40">
              <td class="px-6 py-3">
                <p class="font-body-md text-on-surface">${escapeHtml(p.nameAr)}</p>
                ${p.sku ? `<p class="text-label-sm text-on-surface-variant font-mono">${escapeHtml(p.sku)}</p>` : ""}
              </td>
              <td class="px-6 py-3 text-label-sm text-on-surface-variant">${escapeHtml(variantModeLabel(p.variantMode))}</td>
              <td class="px-6 py-3 font-body-md ${Number(p.stock) <= 0 ? "text-error" : "text-on-surface"}">${formatNumber(p.stock)}</td>
              <td class="px-6 py-3">
                <button type="button" class="text-primary text-label-md hover:underline js-open-inv" data-id="${p.id}">إدارة المخزون</button>
              </td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
  root.querySelectorAll(".js-open-inv").forEach((btn) => {
    btn.addEventListener("click", () => openInventoryModal(Number(btn.getAttribute("data-id"))));
  });
}

async function openInventoryModal(productId) {
  const modal = document.getElementById("inventory-modal");
  const title = document.getElementById("inventory-modal-title");
  const err = document.getElementById("inventory-form-error");
  const product = productsCache.find((p) => Number(p.id) === Number(productId));
  if (!modal || !product) return;
  activeProductId = Number(productId);
  if (err) {
    err.textContent = "";
    err.classList.add("hidden");
  }
  if (title) title.textContent = `مخزون: ${product.nameAr}`;
  resetProductInventory();
  fillSizeSetSelect(product.sizeSetId);
  syncSizeSetWrapVisibility();
  await refreshInventorySizes(product.sizeSetId);
  try {
    const inv = await fetchProductInventory(productId);
    if (inv) {
      setProductInventoryState(inv);
      const hasIds = (inv.variants || []).some((v) => v.id != null);
      setEditingProductId(hasIds ? productId : null);
    }
  } catch {
    setProductInventoryState({ variantMode: product.variantMode || "none", colors: [], variants: [] });
    setEditingProductId(null);
  }
  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
}

function closeInventoryModal() {
  document.getElementById("inventory-modal")?.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
  activeProductId = null;
  setEditingProductId(null);
  resetProductInventory();
}

function fillSizeSetSelect(preferredId) {
  const sel = document.getElementById("inv-size-set-id");
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

/** @type {{ id: number, nameAr: string, slug: string }[]} */
let sizeSetsCache = [];

function syncSizeSetWrapVisibility() {
  const mode = document.getElementById("inv-variant-mode")?.value || "none";
  const wrap = document.getElementById("inv-size-set-wrap");
  if (!wrap) return;
  const show = mode === "size_only" || mode === "color_size";
  wrap.classList.toggle("hidden", !show);
}

async function refreshInventorySizes(setId) {
  await loadSizeLabelsForSetId(setId ? Number(setId) : null);
}

async function reloadProducts() {
  productsCache = (await fetchProductsList()) || [];
  renderList();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (isSupabaseAuthConfigured()) await syncAdminTokenFromSupabaseSession();
  document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
  });
  if (!getAdminToken()) return;

  initProductInventoryPanel({
    root: document.getElementById("inventory-panel-root"),
    modeSelect: document.getElementById("inv-variant-mode"),
    stockWrap: document.getElementById("inv-stock-wrap"),
    onStockMessage: (msg) => {
      const err = document.getElementById("inventory-form-error");
      if (!err || !msg) return;
      err.textContent = msg;
      err.classList.remove("hidden");
      window.setTimeout(() => err.classList.add("hidden"), 3500);
    },
  });
  resetProductInventory();

  document.getElementById("inventory-modal-close")?.addEventListener("click", closeInventoryModal);
  document.getElementById("inventory-modal-close-2")?.addEventListener("click", closeInventoryModal);
  document.getElementById("inventory-modal-backdrop")?.addEventListener("click", closeInventoryModal);
  document.getElementById("inv-variant-mode")?.addEventListener("change", () => syncSizeSetWrapVisibility());
  document.getElementById("inv-size-set-id")?.addEventListener("change", async (e) => {
    await refreshInventorySizes(e.target.value ? Number(e.target.value) : null);
  });

  document.getElementById("inventory-search")?.addEventListener("input", (e) => {
    searchQuery = e.target.value || "";
    renderList();
  });

  document.getElementById("inventory-save-btn")?.addEventListener("click", async () => {
    const errEl = document.getElementById("inventory-form-error");
    if (!activeProductId) return;
    if (errEl) {
      errEl.textContent = "";
      errEl.classList.add("hidden");
    }
    const inventory = getProductInventoryPayload();
    const sizeSetVal = document.getElementById("inv-size-set-id")?.value;
    if (inventory.variantMode === "color_only" || inventory.variantMode === "color_size") {
      const named = (inventory.colors || []).filter((c) => String(c.nameAr || "").trim());
      if (!named.length) {
        if (errEl) {
          errEl.textContent = "اختر لوناً واحداً على الأقل";
          errEl.classList.remove("hidden");
        }
        return;
      }
    }
    if ((inventory.variantMode === "size_only" || inventory.variantMode === "color_size") && !sizeSetVal) {
      if (errEl) {
        errEl.textContent = "اختر مجموعة المقاسات";
        errEl.classList.remove("hidden");
      }
      return;
    }
    const hasVariantIds = (inventory.variants || []).some((v) => v.id != null);
    try {
      await updateProduct(activeProductId, {
        variantMode: inventory.variantMode,
        sizeSetId: sizeSetVal ? Number(sizeSetVal) : null,
      });
      await saveProductInventory(activeProductId, inventory, { preserveStock: hasVariantIds });
      await reloadProducts();
      closeInventoryModal();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err instanceof Error ? err.message : "تعذر الحفظ";
        errEl.classList.remove("hidden");
      }
    }
  });

  try {
    const [prodList, sizeSets, colorPresetList] = await Promise.all([
      fetchProductsList(),
      fetchSizeSets(true),
      fetchColorPresets(true),
    ]);
    if (prodList) productsCache = prodList;
    if (sizeSets) sizeSetsCache = sizeSets.map((s) => ({ id: s.id, nameAr: s.nameAr, slug: s.slug }));
    if (colorPresetList) setColorPresets(colorPresetList);
    renderList();
    const q = new URLSearchParams(window.location.search).get("product");
    const pid = q ? Number(q) : NaN;
    if (Number.isFinite(pid) && productsCache.some((p) => Number(p.id) === pid)) {
      openInventoryModal(pid);
    }
  } catch {
    const root = document.getElementById("inventory-list-root");
    if (root) root.innerHTML = `<p class="text-error text-center py-12">تعذر التحميل</p>`;
  }
});
