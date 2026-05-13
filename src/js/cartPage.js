import { cartSubtotalIqd, readCart, removeFromCart, setCartLineQty } from "./cartStore.js";
import { escapeHtml } from "./storefrontCommon.js";
import { formatPrice } from "./currencyStore.js";

function render() {
  const root = document.getElementById("cart-page-root");
  if (!root) return;
  const lines = readCart();
  if (!lines.length) {
    root.innerHTML = `
      <p class="text-on-surface-variant text-body-md mb-6">السلة فارغة.</p>
      <a href="./home.html" class="inline-flex items-center gap-2 text-primary font-label-md border border-primary px-6 py-3 hover:bg-primary/10 transition-colors">متابعة التسوق</a>`;
    return;
  }

  const rows = lines
    .map((line) => {
      const img = line.imageUrl
        ? `<img src="${escapeHtml(line.imageUrl)}" alt="" class="w-full h-full object-cover"/>`
        : `<div class="w-full h-full bg-surface-container-high"></div>`;
      const label = line.variantLabel
        ? `<p class="text-label-sm text-on-surface-variant mt-1">${escapeHtml(line.variantLabel)}</p>`
        : "";
      return `<div class="luxury-border rounded-lg p-4 flex gap-4 bg-surface-container/30" data-cart-line="${line.variantId}">
        <div class="w-20 h-24 shrink-0 overflow-hidden rounded border border-outline-variant">${img}</div>
        <div class="flex-1 min-w-0">
          <h2 class="font-label-md text-on-surface">${escapeHtml(line.nameAr)}</h2>
          ${label}
          <p class="text-primary font-label-md mt-2">${escapeHtml(formatPrice(line.priceIqd))}</p>
          <div class="flex items-center gap-3 mt-3 flex-wrap">
            <div class="flex items-center border border-outline-variant px-2 py-1 bg-surface-container-low">
              <button type="button" class="js-cart-minus text-primary px-2" data-variant-id="${line.variantId}">−</button>
              <span class="mx-3 min-w-[2ch] text-center">${line.qty}</span>
              <button type="button" class="js-cart-plus text-primary px-2" data-variant-id="${line.variantId}">+</button>
            </div>
            <button type="button" class="js-cart-remove text-error text-label-sm hover:underline" data-variant-id="${line.variantId}">إزالة</button>
          </div>
        </div>
        <div class="text-left shrink-0 font-label-md text-primary">${escapeHtml(formatPrice(line.priceIqd * line.qty))}</div>
      </div>`;
    })
    .join("");

  const subtotal = cartSubtotalIqd();
  root.innerHTML = `
    <div class="space-y-4 mb-10">${rows}</div>
    <div class="border-t border-outline-variant pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <p class="text-on-surface-variant text-label-sm">المجموع الفرعي</p>
        <p class="text-display-sm font-display-sm text-primary">${escapeHtml(formatPrice(subtotal))}</p>
        <p class="text-label-sm text-on-surface-variant mt-1">يُضاف أجر الشحن عند إتمام الطلب حسب المحافظة.</p>
      </div>
      <a href="./checkout.html" class="inline-flex justify-center items-center bg-primary text-on-primary font-label-md px-8 py-3 hover:bg-primary-container transition-colors">إتمام الطلب</a>
    </div>`;

  root.querySelectorAll(".js-cart-minus").forEach((btn) => {
    btn.addEventListener("click", () => {
      const vid = Number(btn.getAttribute("data-variant-id"));
      const line = readCart().find((l) => l.variantId === vid);
      if (line) setCartLineQty(vid, line.qty - 1);
      render();
    });
  });
  root.querySelectorAll(".js-cart-plus").forEach((btn) => {
    btn.addEventListener("click", () => {
      const vid = Number(btn.getAttribute("data-variant-id"));
      const line = readCart().find((l) => l.variantId === vid);
      if (line) setCartLineQty(vid, line.qty + 1);
      render();
    });
  });
  root.querySelectorAll(".js-cart-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeFromCart(Number(btn.getAttribute("data-variant-id")));
      render();
    });
  });
}

document.addEventListener("DOMContentLoaded", render);
window.addEventListener("aw-cart-updated", render);
window.addEventListener("aw-prices-refresh", render);
