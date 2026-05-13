import { getStorefrontSupabase } from "../lib/supabase/storefrontClient.js";
import { cartCount } from "./cartStore.js";
import { currencyToggleLabel, loadCurrencySettings, toggleDisplayCurrency } from "./currencyStore.js";

function renderBadge(count) {
  const nodes = document.querySelectorAll("[data-cart-link]");
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    let badge = node.querySelector("[data-cart-count]");
    if (count > 0) {
      if (!badge) {
        badge = document.createElement("span");
        badge.setAttribute("data-cart-count", "");
        badge.className =
          "absolute -top-1 -left-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold flex items-center justify-center";
        if (getComputedStyle(node).position === "static") node.classList.add("relative");
        node.appendChild(badge);
      }
      badge.textContent = count > 99 ? "99+" : String(count);
    } else if (badge) {
      badge.remove();
    }
  }
}

function updateCurrencyLabels() {
  const label = currencyToggleLabel();
  document.querySelectorAll("[data-currency-toggle]").forEach((el) => {
    const text = el.querySelector("[data-currency-label]");
    if (text) text.textContent = label;
    else if (el instanceof HTMLElement && !el.querySelector(".material-symbols-outlined")) {
      el.textContent = label;
    }
  });
}

export async function initStorefrontNav() {
  const sb = getStorefrontSupabase();
  await loadCurrencySettings(sb);

  const updateCart = () => renderBadge(cartCount());
  document.querySelectorAll("[data-cart-link]").forEach((el) => {
    if (el instanceof HTMLAnchorElement) return;
    if (el instanceof HTMLElement) {
      el.addEventListener("click", () => {
        window.location.href = "./cart.html";
      });
    }
  });
  document.querySelectorAll("[data-currency-toggle]").forEach((el) => {
    el.addEventListener("click", () => {
      toggleDisplayCurrency();
      updateCurrencyLabels();
    });
  });

  window.addEventListener("aw-cart-updated", updateCart);
  window.addEventListener("aw-currency-updated", () => {
    updateCurrencyLabels();
    window.dispatchEvent(new CustomEvent("aw-prices-refresh"));
  });

  updateCart();
  updateCurrencyLabels();
}

document.addEventListener("DOMContentLoaded", () => {
  initStorefrontNav();
});
