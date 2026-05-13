import { categoriesAnchorHref, newArrivalsHref, STOREFRONT } from "./storefrontPaths.js";
import { accountPageHref } from "./customerSession.js";

function scrollToHash(hash, behavior = "smooth") {
  const id = String(hash || "").replace(/^#/, "");
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior, block: "start" });
}

function wireHomeAnchors() {
  if (window.location.hash) {
    requestAnimationFrame(() => scrollToHash(window.location.hash, "auto"));
  }
  window.addEventListener("hashchange", () => {
    if (window.location.hash) scrollToHash(window.location.hash);
  });
}

function wireQuickLinks() {
  document.querySelectorAll("[data-home-link]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const key = el.getAttribute("data-home-link");
    const map = {
      home: STOREFRONT.home,
      categories: categoriesAnchorHref(),
      newArrivals: newArrivalsHref(),
      search: STOREFRONT.search,
      cart: STOREFRONT.cart,
      account: accountPageHref(),
      accountLogin: STOREFRONT.account,
      orders: STOREFRONT.accountOrders,
    };
    const href = map[key || ""];
    if (!href) return;
    if (el instanceof HTMLAnchorElement) el.href = href;
    else el.addEventListener("click", () => {
      window.location.href = href;
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireHomeAnchors();
  wireQuickLinks();
});

window.addEventListener("aw-customer-updated", () => {
  document.querySelectorAll('[data-home-link="account"]').forEach((el) => {
    if (el instanceof HTMLAnchorElement) el.href = accountPageHref();
  });
});
