/** مسارات صفحات المتجر (نسبية من جذر الموقع) */
export const STOREFRONT = {
  launcher: "./index.html",
  home: "./home.html",
  cart: "./cart.html",
  checkout: "./checkout.html",
  search: "./search.html",
  category: "./category.html",
  section: "./section.html",
  product: "./product-detail.html",
  account: "./account.html",
  accountOrders: "./account-orders.html",
};

/** صفحة التصنيف الديناميكية */
export function categoryStorefrontHref(slug) {
  const s = String(slug || "").trim().toLowerCase();
  return `${STOREFRONT.category}?slug=${encodeURIComponent(s)}`;
}

/** صفحة القسم ضمن تصنيف */
export function sectionStorefrontHref(categorySlug, sectionSlug, extra = {}) {
  const params = new URLSearchParams();
  params.set("category", String(categorySlug || "").trim().toLowerCase());
  params.set("section", String(sectionSlug || "").trim().toLowerCase());
  if (extra.subsection) params.set("subsection", String(extra.subsection).trim().toLowerCase());
  if (extra.size) params.set("size", String(extra.size).trim());
  if (extra.color) params.set("color", String(extra.color).trim());
  if (extra.sort) params.set("sort", String(extra.sort).trim());
  if (extra.min) params.set("min", String(extra.min).trim());
  if (extra.max) params.set("max", String(extra.max).trim());
  return `${STOREFRONT.section}?${params.toString()}`;
}

/** صفحة المنتج */
export function productStorefrontHref(productId) {
  return `${STOREFRONT.product}?id=${encodeURIComponent(String(productId))}`;
}

/** صفحة البحث */
export function searchStorefrontHref(query) {
  const q = String(query || "").trim();
  return q ? `${STOREFRONT.search}?q=${encodeURIComponent(q)}` : STOREFRONT.search;
}

/** أقسام الرئيسية (مراسي داخل الصفحة) */
export const HOME_ANCHORS = {
  categories: "home-categories-section",
  newArrivals: "home-new-arrivals",
};

export function homeAnchorHref(anchorId) {
  const id = String(anchorId || "").replace(/^#/, "");
  return id ? `${STOREFRONT.home}#${id}` : STOREFRONT.home;
}

export function newArrivalsHref() {
  return homeAnchorHref(HOME_ANCHORS.newArrivals);
}

export function categoriesAnchorHref() {
  return homeAnchorHref(HOME_ANCHORS.categories);
}
