import { getStorefrontSupabase } from "../lib/supabase/storefrontClient.js";
import { cartSubtotalIqd, clearCart, readCart } from "./cartStore.js";
import { escapeHtml, formatIqd } from "./storefrontCommon.js";

/** @type {{ id: number, nameAr: string, feeIqd: number }[]} */
let governorates = [];
let selectedGovId = null;

function orderErrorMessage(err) {
  const msg = String(err?.message || err || "");
  if (msg.includes("CUSTOMER_NAME_REQUIRED")) return "أدخل اسم المستلم";
  if (msg.includes("CUSTOMER_PHONE_REQUIRED")) return "أدخل رقم الهاتف";
  if (msg.includes("CUSTOMER_ADDRESS_REQUIRED")) return "أدخل العنوان";
  if (msg.includes("GOVERNORATE_REQUIRED")) return "اختر المحافظة";
  if (msg.includes("GOVERNORATE_INVALID")) return "المحافظة غير صالحة";
  if (msg.includes("CART_EMPTY")) return "السلة فارغة";
  if (msg.includes("INSUFFICIENT_STOCK")) return "كمية غير متوفرة لأحد المنتجات — راجع السلة";
  if (msg.includes("PRODUCT_UNAVAILABLE")) return "أحد المنتجات لم يعد متاحاً";
  if (msg.includes("VARIANT_NOT_FOUND")) return "خيار منتج غير موجود — حدّث السلة";
  return msg || "تعذر إرسال الطلب";
}

function shippingFee() {
  const g = governorates.find((x) => x.id === selectedGovId);
  return g ? g.feeIqd : 0;
}

function renderSuccess(result) {
  const root = document.getElementById("checkout-page-root");
  if (!root) return;
  root.innerHTML = `
    <div class="luxury-border rounded-lg p-8 bg-surface-container/30 text-center">
      <span class="material-symbols-outlined text-primary text-5xl mb-4">check_circle</span>
      <h2 class="text-headline-sm font-headline-sm text-on-surface mb-2">تم استلام طلبك</h2>
      <p class="text-on-surface-variant mb-4">رقم الطلب: <strong class="text-primary font-mono dir-ltr">${escapeHtml(String(result.order_ref || ""))}</strong></p>
      <p class="text-primary font-label-md">${escapeHtml(formatIqd(result.total_iqd))}</p>
      <a href="./home.html" class="inline-block mt-8 text-primary border border-primary px-6 py-3 hover:bg-primary/10">العودة للمتجر</a>
    </div>`;
}

function renderForm() {
  const root = document.getElementById("checkout-page-root");
  if (!root) return;
  const lines = readCart();
  if (!lines.length) {
    window.location.href = "./cart.html";
    return;
  }

  const subtotal = cartSubtotalIqd();
  const shipping = shippingFee();
  const total = subtotal + shipping;

  const govOptions = governorates
    .map((g) => {
      const sel = selectedGovId === g.id ? "selected" : "";
      return `<option value="${g.id}" ${sel}>${escapeHtml(g.nameAr)} — ${escapeHtml(formatIqd(g.feeIqd))}</option>`;
    })
    .join("");

  const summary = lines
    .map(
      (l) =>
        `<li class="flex justify-between gap-4 text-label-sm py-2 border-b border-outline-variant/40">
          <span>${escapeHtml(l.nameAr)}${l.variantLabel ? ` <span class="text-on-surface-variant">(${escapeHtml(l.variantLabel)})</span>` : ""} × ${l.qty}</span>
          <span class="text-primary shrink-0">${escapeHtml(formatIqd(l.priceIqd * l.qty))}</span>
        </li>`,
    )
    .join("");

  root.innerHTML = `
    <form id="checkout-form" class="grid grid-cols-1 lg:grid-cols-2 gap-10">
      <div class="space-y-4">
        <div>
          <label class="block text-label-sm text-on-surface-variant mb-1">الاسم الكامل *</label>
          <input id="co-name" required class="w-full bg-surface-container border border-outline-variant px-3 py-2 focus:border-primary outline-none" type="text"/>
        </div>
        <div>
          <label class="block text-label-sm text-on-surface-variant mb-1">رقم الهاتف *</label>
          <input id="co-phone" required dir="ltr" class="w-full bg-surface-container border border-outline-variant px-3 py-2 focus:border-primary outline-none text-left" type="tel" placeholder="07xxxxxxxx"/>
        </div>
        <div>
          <label class="block text-label-sm text-on-surface-variant mb-1">المحافظة *</label>
          <select id="co-governorate" required class="w-full bg-surface-container border border-outline-variant px-3 py-2 focus:border-primary outline-none">
            <option value="">— اختر المحافظة —</option>
            ${govOptions}
          </select>
        </div>
        <div>
          <label class="block text-label-sm text-on-surface-variant mb-1">العنوان التفصيلي *</label>
          <textarea id="co-address" required rows="3" class="w-full bg-surface-container border border-outline-variant px-3 py-2 focus:border-primary outline-none resize-y"></textarea>
        </div>
        <p id="checkout-error" class="hidden text-error text-label-sm"></p>
        <button type="submit" class="w-full bg-primary text-on-primary font-label-md py-3 hover:bg-primary-container transition-colors">تأكيد الطلب</button>
        <p class="text-label-sm text-on-surface-variant">الدفع عند الاستلام. سيتم التواصل معك لتأكيد الطلب.</p>
      </div>
      <div class="luxury-border rounded-lg p-6 bg-surface-container/30 h-fit">
        <h2 class="font-label-md text-primary mb-4">ملخص الطلب</h2>
        <ul class="mb-4">${summary}</ul>
        <div class="space-y-2 text-label-sm">
          <div class="flex justify-between"><span class="text-on-surface-variant">المجموع الفرعي</span><span>${escapeHtml(formatIqd(subtotal))}</span></div>
          <div class="flex justify-between"><span class="text-on-surface-variant">الشحن</span><span id="co-shipping-line">${escapeHtml(formatIqd(shipping))}</span></div>
          <div class="flex justify-between text-primary font-label-md pt-2 border-t border-outline-variant"><span>الإجمالي</span><span id="co-total-line">${escapeHtml(formatIqd(total))}</span></div>
        </div>
      </div>
    </form>`;

  const govSel = document.getElementById("co-governorate");
  govSel?.addEventListener("change", () => {
    selectedGovId = Number(govSel.value) || null;
    const ship = shippingFee();
    const tot = subtotal + ship;
    const shipEl = document.getElementById("co-shipping-line");
    const totEl = document.getElementById("co-total-line");
    if (shipEl) shipEl.textContent = formatIqd(ship);
    if (totEl) totEl.textContent = formatIqd(tot);
  });

  document.getElementById("checkout-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("checkout-error");
    if (errEl) {
      errEl.classList.add("hidden");
      errEl.textContent = "";
    }
    const sb = getStorefrontSupabase();
    if (!sb) return;

    const payload = {
      customer_name: document.getElementById("co-name")?.value?.trim() || "",
      customer_phone: document.getElementById("co-phone")?.value?.trim() || "",
      customer_address: document.getElementById("co-address")?.value?.trim() || "",
      governorate_id: document.getElementById("co-governorate")?.value || "",
      items: readCart().map((l) => ({ variant_id: l.variantId, qty: l.qty })),
    };

    const btn = e.target?.querySelector?.('button[type="submit"]');
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = true;
      btn.textContent = "جاري الإرسال…";
    }

    const { data, error } = await sb.rpc("place_store_order", { payload });
    if (error) {
      if (errEl) {
        errEl.textContent = orderErrorMessage(error);
        errEl.classList.remove("hidden");
      }
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = false;
        btn.textContent = "تأكيد الطلب";
      }
      return;
    }

    clearCart();
    renderSuccess(data || {});
  });
}

async function main() {
  const root = document.getElementById("checkout-page-root");
  if (!root) return;
  if (!readCart().length) {
    window.location.href = "./cart.html";
    return;
  }

  const sb = getStorefrontSupabase();
  if (!sb) {
    root.innerHTML = '<p class="text-error">لم يُضبط Supabase في البناء.</p>';
    return;
  }

  const { data, error } = await sb
    .from("shipping_governorates")
    .select("id,name_ar,fee_iqd,sort_order")
    .eq("is_active", 1)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    root.innerHTML = `<p class="text-error">${escapeHtml(error.message)}</p>`;
    return;
  }

  governorates = (data || []).map((g) => ({
    id: Number(g.id),
    nameAr: g.name_ar || "",
    feeIqd: Number(g.fee_iqd) || 0,
  }));
  selectedGovId = governorates[0]?.id ?? null;
  renderForm();
}

document.addEventListener("DOMContentLoaded", main);
