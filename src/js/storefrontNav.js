import { cartCount } from "./cartStore.js";

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

export function initStorefrontNav() {
  const update = () => renderBadge(cartCount());
  document.querySelectorAll("[data-cart-link]").forEach((el) => {
    if (el instanceof HTMLAnchorElement) return;
    if (el instanceof HTMLElement) {
      el.addEventListener("click", () => {
        window.location.href = "./cart.html";
      });
    }
  });
  window.addEventListener("aw-cart-updated", update);
  update();
}

document.addEventListener("DOMContentLoaded", initStorefrontNav);
