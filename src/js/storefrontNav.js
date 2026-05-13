import { getStorefrontSupabase } from "../lib/supabase/storefrontClient.js";
import { cartCount } from "./cartStore.js";
import { currencyToggleLabel, loadCurrencySettings, toggleDisplayCurrency } from "./currencyStore.js";
import { accountPageHref } from "./customerSession.js";
import { categoryStorefrontHref, searchStorefrontHref, categoriesAnchorHref } from "./storefrontPaths.js";
import { escapeHtml } from "./storefrontCommon.js";

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

async function populateNavCategories(sb) {
  const desktop = document.querySelectorAll("[data-nav-categories]");
  const mobile = document.querySelectorAll("[data-nav-categories-mobile]");
  if ((!desktop.length && !mobile.length) || !sb) return;

  const { data, error } = await sb
    .from("categories")
    .select("name_ar,slug")
    .eq("is_active", 1)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) return;

  const linkCls =
    "text-on-surface-variant hover:text-primary transition-colors font-headline-sm text-headline-sm whitespace-nowrap";
  const activeCls =
    "text-primary font-bold border-b-2 border-primary pb-1 font-headline-sm text-headline-sm whitespace-nowrap";
  const mobileCls =
    "inline-flex px-3 py-1 rounded-full border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary";

  const path = window.location.pathname.toLowerCase();
  const onCategory = path.endsWith("/category.html") || path.endsWith("category.html");
  const activeSlug = onCategory
    ? new URLSearchParams(window.location.search).get("slug")?.trim().toLowerCase() || ""
    : "";

  const desktopLinks = (data || [])
    .map((c) => {
      const slug = String(c.slug || "").trim().toLowerCase();
      const href = categoryStorefrontHref(slug);
      const cls = onCategory && activeSlug === slug ? activeCls : linkCls;
      return `<a class="${cls}" href="${escapeHtml(href)}">${escapeHtml(c.name_ar || slug)}</a>`;
    })
    .join("");

  const mobileLinks = [
    `<a class="${mobileCls}" href="${escapeHtml(categoriesAnchorHref())}">المجموعات</a>`,
    ...(data || []).map((c) => {
      const slug = String(c.slug || "").trim().toLowerCase();
      const href = categoryStorefrontHref(slug);
      return `<a class="${mobileCls}" href="${escapeHtml(href)}">${escapeHtml(c.name_ar || slug)}</a>`;
    }),
  ].join("");

  desktop.forEach((el) => {
    el.innerHTML = desktopLinks;
  });
  mobile.forEach((el) => {
    el.innerHTML = mobileLinks;
  });
}

function wireSearchForms() {
  document.querySelectorAll("[data-storefront-search]").forEach((form) => {
    if (!(form instanceof HTMLFormElement)) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = new FormData(form).get("q");
      window.location.href = searchStorefrontHref(q);
    });
  });
}

function wireHeroCtas() {
  document.querySelectorAll("[data-scroll-to]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.addEventListener("click", () => {
      const sel = el.getAttribute("data-scroll-to");
      if (!sel) return;
      const target = document.querySelector(sel);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

export async function initStorefrontNav() {
  const sb = getStorefrontSupabase();
  await loadCurrencySettings(sb);
  await populateNavCategories(sb);

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

  wireSearchForms();
  wireHeroCtas();

  document.querySelectorAll("[data-account-link]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const go = () => {
      window.location.href = accountPageHref();
    };
    if (el instanceof HTMLAnchorElement) {
      el.href = accountPageHref();
      return;
    }
    el.addEventListener("click", go);
  });

  window.addEventListener("aw-customer-updated", () => {
    document.querySelectorAll("[data-account-link]").forEach((el) => {
      if (el instanceof HTMLAnchorElement) el.href = accountPageHref();
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
