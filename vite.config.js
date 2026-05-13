import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

/** مسار النشر العام (مثال GitHub Pages: `/American-wear/`). يُضبط عبر BASE_PATH في CI فقط عادةً. */
function publicBase() {
  const raw = (process.env.BASE_PATH ?? "").trim();
  if (!raw) return "/";
  let b = raw.startsWith("/") ? raw : `/${raw}`;
  if (!b.endsWith("/")) b += "/";
  return b;
}

function parseApiPort(env) {
  const p = Number.parseInt(String(env.PORT ?? "").trim(), 10);
  if (Number.isFinite(p) && p > 0 && p <= 65535) return p;
  return 3000;
}

/** @type {import('vite').UserConfigFnObject} */
export default ({ mode }) => {
  const env = loadEnv(mode, root, "");
  const apiPort = parseApiPort(env);
  const apiTarget = `http://127.0.0.1:${apiPort}`;

  return {
    base: publicBase(),
    appType: "mpa",
    /** يعرّض متغيرات البيئة التي تبدأ بـ VITE_ أو NEXT_PUBLIC_ (مثل قالب Supabase App Router) */
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    server: {
      open: "/",
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
      fs: {
        allow: [root],
      },
    },
    /** نفس توجيه /api أثناء `vite preview` — المنفذ من PORT في `.env` */
    preview: {
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
    build: {
      rollupOptions: {
        input: {
          home: resolve(root, "index.html"),
          storefront: resolve(root, "home.html"),
          cart: resolve(root, "cart.html"),
          checkout: resolve(root, "checkout.html"),
          productDetail: resolve(root, "product-detail.html"),
          categoryWatches: resolve(root, "category-watches.html"),
          categoryPerfumes: resolve(root, "category-perfumes.html"),
          categoryShoes: resolve(root, "category-shoes.html"),
          categoryMenswear: resolve(root, "category-menswear.html"),
          categoryDynamic: resolve(root, "category.html"),
          sectionStorefront: resolve(root, "section.html"),
          accountOrders: resolve(root, "account-orders.html"),
          accountOrdersSidebar: resolve(root, "account-orders-with-sidebar.html"),
          adminLogin: resolve(root, "admin/login.html"),
          adminDashboard: resolve(root, "admin/index.html"),
          adminProducts: resolve(root, "admin/products.html"),
          adminOrders: resolve(root, "admin/orders.html"),
          adminSizes: resolve(root, "admin/sizes.html"),
          adminColors: resolve(root, "admin/colors.html"),
          adminShipping: resolve(root, "admin/shipping.html"),
          adminPayments: resolve(root, "admin/payments.html"),
          adminUsers: resolve(root, "admin/users.html"),
          adminCategories: resolve(root, "admin/categories.html"),
        },
      },
    },
  };
};
