/** روابط الصفحات الثابتة للتصنيفات (slug كما في قاعدة البيانات) */
export const CATEGORY_SLUG_STATIC_PAGE = {
  shoes: "./category-shoes.html",
  watches: "./category-watches.html",
  perfumes: "./category-perfumes.html",
  menswear: "./category-menswear.html",
};

/** صفحة التصنيف: ثابتة إن وُجدت، وإلا `category.html?slug=` */
export function categoryStorefrontHref(slug) {
  const s = String(slug || "").trim().toLowerCase();
  return CATEGORY_SLUG_STATIC_PAGE[s] || `./category.html?slug=${encodeURIComponent(s)}`;
}

/** صفحة القسم الفرعي ضمن تصنيف (منتجات القسم) */
export function sectionStorefrontHref(categorySlug, sectionSlug) {
  const c = String(categorySlug || "").trim().toLowerCase();
  const sec = String(sectionSlug || "").trim().toLowerCase();
  return `./section.html?category=${encodeURIComponent(c)}&section=${encodeURIComponent(sec)}`;
}
