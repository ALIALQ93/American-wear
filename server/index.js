import "./env.mjs";
import express from "express";
import { getSupabaseAuthServerClient, resolvedSupabaseUrlForHealth, resolvedAuthKeyKind } from "./lib/supabase/server.js";
import {
  initDb,
  getDashboard,
  getOrdersStats,
  getOrders,
  getProductsStats,
  getProducts,
  getSizes,
  listCategoriesTree,
  createCategory,
  updateCategory,
  createSection,
  updateSection,
  deleteCategory,
  deleteSection,
  getProductById,
  getCategoryNameArById,
  createProduct,
  updateProduct,
  getAdminProfileByUserId,
  listAdminProfiles,
  getAuthUserById,
  createAdminProfile,
  updateAdminProfile,
  deleteAdminProfile,
} from "./db.js";

const PORT = Number(process.env.PORT) || 3000;

const statusLabelAr = {
  pending: "قيد المراجعة",
  processing: "قيد التجهيز",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغى",
};

function mapStatusType(status) {
  const s = String(status || "");
  if (s === "cancelled") return "cancelled";
  if (s === "shipped") return "shipping";
  if (s === "delivered") return "done";
  if (s === "processing") return "processing";
  if (s === "pending") return "pending";
  return "pending";
}

function initialsFromName(name) {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase();
  if (p[0]?.length >= 2) return p[0].slice(0, 2).toUpperCase();
  return "؟";
}

function isValidSlug(slug) {
  return Boolean(slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(String(slug)));
}

function toCategoryRow(body) {
  return {
    name_ar: String(body.nameAr ?? "").trim(),
    name_en: body.nameEn != null && String(body.nameEn).trim() !== "" ? String(body.nameEn).trim() : null,
    slug: String(body.slug ?? "").trim().toLowerCase(),
    description_ar:
      body.descriptionAr != null && String(body.descriptionAr).trim() !== "" ? String(body.descriptionAr).trim() : null,
    image_url:
      body.imageUrl != null && String(body.imageUrl).trim() !== "" ? String(body.imageUrl).trim() : null,
    sort_order: body.sortOrder != null ? Number(body.sortOrder) || 0 : 0,
    is_active: body.isActive === false || body.isActive === 0 ? 0 : 1,
  };
}

function toSectionRow(body) {
  return {
    name_ar: String(body.nameAr ?? "").trim(),
    name_en: body.nameEn != null && String(body.nameEn).trim() !== "" ? String(body.nameEn).trim() : null,
    slug: String(body.slug ?? "").trim().toLowerCase(),
    sort_order: body.sortOrder != null ? Number(body.sortOrder) || 0 : 0,
    is_active: body.isActive === false || body.isActive === 0 ? 0 : 1,
  };
}

async function validateProductSection(categoryId, sectionId) {
  if (sectionId == null) return true;
  const cid = categoryId != null ? Number(categoryId) : NaN;
  const sid = Number(sectionId);
  if (!Number.isFinite(sid) || !Number.isFinite(cid)) return false;
  const tree = await listCategoriesTree(true);
  const cat = tree.find((c) => Number(c.id) === cid);
  if (!cat) return false;
  return cat.sections.some((s) => Number(s.id) === sid);
}

/** بريد أو أكثر مسموح بدخول الإدارة بعد مصادقة Supabase (مفصولة بفاصلة إنجليزية في .env) */
function getAllowedAdminEmails() {
  const raw = process.env.ADMIN_ALLOWED_EMAILS;
  if (raw == null || String(raw).trim() === "") return [];
  return String(raw)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** يوجد على الأقل مسؤول أعلى نشط — مطلوب قبل السماح بربط أدوار admin فقط */
function hasActiveSuperAdmin(profiles) {
  return profiles.some((p) => p.role === "super_admin" && p.isActive);
}

function requireSuperAdmin(req, res, next) {
  if (req.admin?.role !== "super_admin") {
    return res.status(403).json({
      error: "هذا الإجراء متاح فقط لمسؤول أعلى (super_admin).",
      code: "REQUIRES_SUPER_ADMIN",
    });
  }
  return next();
}

/** في التطوير المحلي (أي ليس production) نُرجع تفاصيل أكثر للتشخيص */
const isAuthDebug = process.env.NODE_ENV !== "production";

async function requireAdmin(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return res.status(401).json({ error: "لم يُرسل رمز الدخول", code: "MISSING_BEARER" });
  }
  const token = m[1];

  const sb = getSupabaseAuthServerClient();
  if (!sb) {
    return res.status(503).json({
      error:
        "اضبط على الخادم عنوان Supabase ومفتاح التحقق: SUPABASE_URL و SUPABASE_ANON_KEY (أو انسخ من VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY أو NEXT_PUBLIC_*). بدونهما لا يمكن التحقق من جلسة الإدارة.",
      code: "MISSING_SUPABASE_SERVER_ENV",
    });
  }

  try {
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user?.email) {
      if (error?.message) console.error("[admin auth] getUser:", error.message);
      const hint =
        isAuthDebug && error?.message
          ? ` (تفاصيل: ${error.message})`
          : "";
      return res.status(401).json({
        code: "SUPABASE_GET_USER_FAILED",
        error: `انتهت الجلسة أو رمز الدخول غير مقبول من الخادم. جرّب وضع مفتاح anon التقليدي (eyJ…) في SUPABASE_ANON_KEY إن كنت تستخدم مفتاح publishable فقط.${hint}`,
        /** يظهر في التطوير المحلي — يساعد على تمييز مفتاح خاطئ مقابل رمز منتهٍ */
        debug: isAuthDebug && error?.message ? { supabaseMessage: error.message } : undefined,
      });
    }
    const email = data.user.email.toLowerCase();
    const profile = await getAdminProfileByUserId(data.user.id);
    if (profile?.isActive) {
      req.admin = {
        sub: data.user.id,
        email: data.user.email,
        role: profile.role,
        source: "admin_profile",
      };
      return next();
    }
    if (profile && !profile.isActive) {
      return res.status(403).json({
        error: "حسابك موقوف في قائمة المسؤولين.",
        code: "ADMIN_INACTIVE",
      });
    }
    const allowed = getAllowedAdminEmails();
    if (!profile && allowed.includes(email)) {
      req.admin = {
        sub: data.user.id,
        email: data.user.email,
        role: "admin",
        source: "env_allowlist",
      };
      return next();
    }
    return res.status(403).json({
      error:
        "ليس لديك صلاحية لوحة الإدارة. أضف صفاً في جدول admin_profiles (من صفحة المسؤولين لمسؤول أعلى) أو أضف بريدك مؤقتاً في ADMIN_ALLOWED_EMAILS في .env.",
      code: "NOT_REGISTERED_AS_ADMIN",
    });
  } catch (e) {
    console.error(e);
    return res.status(401).json({
      error: "فشل التحقق من الهوية",
      code: "SUPABASE_AUTH_EXCEPTION",
      debug: isAuthDebug ? { message: String(e?.message || e) } : undefined,
    });
  }
}

try {
  await initDb();
  console.log("قاعدة البيانات: PostgreSQL — الاتصال ناجح");
} catch (e) {
  console.error("تعذر بدء الخادم: فشل الاتصال بقاعدة البيانات (تحقق من DATABASE_URL وكلمة المرور وSSL).");
  const msg = String(e?.message || e);
  console.error(msg);
  console.error(
    "لن يُفتتح منفذ API حتى ينجح الاتصال — إن كان Vite يعمل ستظهر أخطاء وكيل مثل ECONNREFUSED على /api حتى يقلع الخادم.",
  );
  if (msg.includes("ETIMEDOUT")) {
    console.error(
      "تلميح: غالباً شبكة أو جدار ناري يمنع الوصول إلى منفذ Postgres. إن ظهر عنوان IPv6 في السطر أعلاه، أعد المحاولة بعد التحديث (يُفضّل IPv4). أو انسخ «Session mode» / pooler من Supabase → Database → Connection string.",
    );
  }
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "512kb" }));

/** أصول مسموح بها للمتصفح (مفصولة بفاصلة) عند استضافة الواجهة على نطاق آخر مثل GitHub Pages. مثال: https://alialq93.github.io */
function corsAllowedOrigins() {
  const raw = process.env.CORS_ORIGINS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}
app.use((req, res, next) => {
  const allowed = corsAllowedOrigins();
  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

/** للتأكد أن الخادم يعمل (بدون مصادقة) — جرّب: GET http://127.0.0.1:<PORT>/api/health حيث PORT من .env (افتراضي 3000) */
app.get("/api/health", (_req, res) => {
  const sb = getSupabaseAuthServerClient();
  const allow = getAllowedAdminEmails();
  let supabaseUrlHost = null;
  const serverSupabaseUrl = resolvedSupabaseUrlForHealth();
  if (serverSupabaseUrl) {
    try {
      supabaseUrlHost = new URL(serverSupabaseUrl).host;
    } catch {
      supabaseUrlHost = "invalid_url";
    }
  }
  let viteSupabaseHost = null;
  const viteUrl = process.env.VITE_SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (viteUrl) {
    try {
      viteSupabaseHost = new URL(viteUrl).host;
    } catch {
      viteSupabaseHost = "invalid_url";
    }
  }
  res.json({
    ok: true,
    db: "postgres",
    auth: sb ? "supabase_configured" : "not_configured",
    adminAllowlist: allow.length ? "configured" : "empty",
    supabaseUrlHost,
    viteSupabaseHost,
    /** إن كان false فالمتصفح يتحدث مع مشروع Supabase مختلف عن خادم التحقق */
    supabaseHostsMatch:
      supabaseUrlHost && viteSupabaseHost ? supabaseUrlHost === viteSupabaseHost : null,
    /** jwt = مفتاح anon الكلاسيكي؛ publishable قد يسبب فشل getUser — انسخ anon من نفس صفحة API */
    serverAuthKeyKind: resolvedAuthKeyKind(),
  });
});

app.get("/api/admin/session", requireAdmin, (req, res) => {
  res.json({
    email: req.admin.email,
    role: req.admin.role,
    source: req.admin.source,
  });
});

app.get("/api/admin/users", requireAdmin, requireSuperAdmin, async (_req, res) => {
  try {
    res.json(await listAdminProfiles());
  } catch (e) {
    console.error(e);
    if (e?.code === "42P01") {
      return res.status(503).json({
        error: "جدول admin_profiles غير موجود. نفّذ npm run db:push أو طبّق الهجرات على Supabase.",
        code: "TABLE_MISSING",
      });
    }
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.post("/api/admin/users", requireAdmin, requireSuperAdmin, async (req, res) => {
  const b = req.body || {};
  const userId = String(b.userId || "").trim();
  const role = String(b.role || "admin");
  const emailIn = String(b.email || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return res.status(400).json({ error: "معرف المستخدم (UUID) غير صالح" });
  }
  try {
    const profiles = await listAdminProfiles();
    if (!hasActiveSuperAdmin(profiles) && role !== "super_admin") {
      return res.status(400).json({
        error:
          "أول مسؤول يُربَط في النظام يجب أن يكون super_admin (مسؤول أعلى). بعدها يمكن إضافة مسؤولين بدور admin.",
        code: "FIRST_MUST_BE_SUPER_ADMIN",
      });
    }
    const au = await getAuthUserById(userId);
    if (!au) {
      return res.status(404).json({
        error:
          "لا يوجد مستخدم بهذا المعرف في Authentication. أنشئ الحساب أولاً في Supabase → Authentication → Users ثم انسخ User UID.",
        code: "AUTH_USER_NOT_FOUND",
      });
    }
    const email = emailIn || String(au.email || "").toLowerCase();
    const created = await createAdminProfile({ userId, email, role });
    res.status(201).json(created);
  } catch (e) {
    if (e?.code === "23505") {
      return res.status(409).json({
        error: "هذا المستخدم مربوط مسبقاً بجدول الصلاحيات.",
        code: "DUPLICATE_PROFILE",
      });
    }
    if (e?.code === "BAD_ROLE") return res.status(400).json({ error: "الدور غير مسموح (admin أو super_admin)." });
    if (e?.code === "BAD_EMAIL") return res.status(400).json({ error: "البريد مطلوب أو غير صالح." });
    if (e?.code === "42P01") {
      return res.status(503).json({
        error: "جدول admin_profiles غير موجود. نفّذ npm run db:push.",
        code: "TABLE_MISSING",
      });
    }
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.patch("/api/admin/users/:userId", requireAdmin, requireSuperAdmin, async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  const b = req.body || {};
  const patch = {};
  if (b.role !== undefined) patch.role = String(b.role);
  if (b.isActive !== undefined) patch.isActive = b.isActive !== false && b.isActive !== 0;
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "لم يُرسل أي تعديل" });
  }
  try {
    const profiles = await listAdminProfiles();
    const target = profiles.find((p) => p.userId === userId);
    if (!target) return res.status(404).json({ error: "المسؤول غير موجود" });

    const newRole = patch.role !== undefined ? patch.role : target.role;
    const newActive = patch.isActive !== undefined ? patch.isActive : target.isActive;
    const wasSuperActive = target.role === "super_admin" && target.isActive;
    const willBeSuperActive = newRole === "super_admin" && newActive;

    if (wasSuperActive && !willBeSuperActive) {
      const otherActiveSupers = profiles.filter(
        (p) => p.userId !== userId && p.role === "super_admin" && p.isActive,
      );
      if (otherActiveSupers.length === 0) {
        return res.status(400).json({
          error: "يجب أن يبقى مسؤول أعلى واحد على الأقل نشطاً (super_admin).",
          code: "LAST_SUPER_ADMIN",
        });
      }
    }

    const updated = await updateAdminProfile(userId, patch);
    if (!updated) return res.status(404).json({ error: "المسؤول غير موجود" });
    res.json(updated);
  } catch (e) {
    if (e?.code === "BAD_ROLE") return res.status(400).json({ error: "الدور غير مسموح." });
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.delete("/api/admin/users/:userId", requireAdmin, requireSuperAdmin, async (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (userId === req.admin.sub) {
    return res.status(400).json({ error: "لا يمكنك حذف صلاحياتك أنت بهذه الطريقة." });
  }
  try {
    const profiles = await listAdminProfiles();
    const target = profiles.find((p) => p.userId === userId);
    if (!target) return res.status(404).json({ error: "غير موجود" });
    if (target.role === "super_admin" && target.isActive) {
      const otherActiveSupers = profiles.filter(
        (p) => p.userId !== userId && p.role === "super_admin" && p.isActive,
      );
      if (otherActiveSupers.length === 0) {
        return res.status(400).json({
          error: "لا يمكن حذف ربط آخر مسؤول أعلى نشط.",
          code: "LAST_SUPER_ADMIN",
        });
      }
    }
    const ok = await deleteAdminProfile(userId);
    if (!ok) return res.status(404).json({ error: "غير موجود" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.get("/api/admin/dashboard", requireAdmin, async (req, res) => {
  try {
    const { stats, recentRows } = await getDashboard();
    const recentOrders = recentRows.map((r) => ({
      ...r,
      initials: initialsFromName(r.customerName),
      statusLabelAr: statusLabelAr[r.status] || r.status,
      statusType: mapStatusType(r.status),
    }));
    res.json({ stats, recentOrders });
  } catch (e) {
    console.error(e);
    const payload = { error: "خطأ في الخادم", code: "ADMIN_DASHBOARD_FAILED" };
    if (isAuthDebug && e?.message) payload.detail = e.message;
    res.status(500).json(payload);
  }
});

app.get("/api/admin/orders/stats", requireAdmin, async (req, res) => {
  try {
    res.json(await getOrdersStats());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const rows = await getOrders();
    res.json(
      rows.map((r) => ({
        ...r,
        initials: initialsFromName(r.customerName),
        statusLabelAr: statusLabelAr[r.status] || r.status,
      })),
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.get("/api/admin/products/stats", requireAdmin, async (req, res) => {
  try {
    res.json(await getProductsStats());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.get("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    res.json(await getProducts());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.post("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const name_ar = String(b.nameAr ?? "").trim();
    if (!name_ar) return res.status(400).json({ error: "اسم المنتج بالعربية مطلوب" });
    const name_en = b.nameEn != null && String(b.nameEn).trim() !== "" ? String(b.nameEn).trim() : null;
    const sku = b.sku != null && String(b.sku).trim() !== "" ? String(b.sku).trim() : null;
    const image_url = b.imageUrl != null && String(b.imageUrl).trim() !== "" ? String(b.imageUrl).trim() : null;
    const category_id = b.categoryId != null && b.categoryId !== "" ? Number(b.categoryId) : null;
    const section_id = b.sectionId != null && b.sectionId !== "" ? Number(b.sectionId) : null;
    if (category_id !== null && !Number.isFinite(category_id)) return res.status(400).json({ error: "تصنيف غير صالح" });
    if (section_id !== null && !Number.isFinite(section_id)) return res.status(400).json({ error: "قسم فرعي غير صالح" });
    if (!(await validateProductSection(category_id, section_id))) {
      return res.status(400).json({ error: "القسم الفرعي لا يطابق التصنيف المختار" });
    }
    const price_iqd = Math.max(0, Math.floor(Number(b.priceIqd ?? 0)));
    const stock = Math.max(0, Math.floor(Number(b.stock ?? 0)));
    const is_active = b.isActive === false || b.isActive === 0 ? 0 : 1;
    let category = b.category != null && String(b.category).trim() !== "" ? String(b.category).trim() : null;
    if (!category && category_id != null) category = await getCategoryNameArById(category_id);
    const id = await createProduct({
      name_ar,
      name_en,
      category,
      sku,
      price_iqd,
      stock,
      is_active,
      image_url,
      category_id,
      section_id,
    });
    res.status(201).json({ id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "معرف غير صالح" });
    const current = await getProductById(id);
    if (!current) return res.status(404).json({ error: "المنتج غير موجود" });
    const b = req.body || {};
    const patch = {};
    if (b.nameAr !== undefined) patch.name_ar = String(b.nameAr).trim();
    if (b.nameEn !== undefined) patch.name_en = b.nameEn == null || String(b.nameEn).trim() === "" ? null : String(b.nameEn).trim();
    if (b.sku !== undefined) patch.sku = b.sku == null || String(b.sku).trim() === "" ? null : String(b.sku).trim();
    if (b.imageUrl !== undefined) patch.image_url = b.imageUrl == null || String(b.imageUrl).trim() === "" ? null : String(b.imageUrl).trim();
    if (b.priceIqd !== undefined) patch.price_iqd = Math.max(0, Math.floor(Number(b.priceIqd)));
    if (b.stock !== undefined) patch.stock = Math.max(0, Math.floor(Number(b.stock)));
    if (b.isActive !== undefined) patch.is_active = b.isActive === false || b.isActive === 0 ? 0 : 1;
    if (b.categoryId !== undefined) {
      patch.category_id = b.categoryId === null || b.categoryId === "" ? null : Number(b.categoryId);
      if (patch.category_id !== null && !Number.isFinite(patch.category_id)) {
        return res.status(400).json({ error: "تصنيف غير صالح" });
      }
    }
    if (b.sectionId !== undefined) {
      patch.section_id = b.sectionId === null || b.sectionId === "" ? null : Number(b.sectionId);
      if (patch.section_id !== null && !Number.isFinite(patch.section_id)) {
        return res.status(400).json({ error: "قسم فرعي غير صالح" });
      }
    }
    if (b.category !== undefined) {
      patch.category = b.category == null || String(b.category).trim() === "" ? null : String(b.category).trim();
    }
    if (patch.name_ar !== undefined && !patch.name_ar) {
      return res.status(400).json({ error: "اسم المنتج بالعربية مطلوب" });
    }

    let categoryId = patch.category_id !== undefined ? patch.category_id : current.category_id;
    let sectionId = patch.section_id !== undefined ? patch.section_id : current.section_id;
    if (patch.category_id === null) {
      patch.section_id = null;
      if (patch.category === undefined) patch.category = null;
      categoryId = null;
      sectionId = null;
    } else if (patch.category_id !== undefined && patch.section_id === undefined) {
      if (sectionId != null && !(await validateProductSection(patch.category_id, sectionId))) {
        patch.section_id = null;
        sectionId = null;
      }
    }
    if (!(await validateProductSection(categoryId, sectionId))) {
      return res.status(400).json({ error: "القسم الفرعي لا يطابق التصنيف المختار" });
    }
    if (patch.category_id !== undefined && patch.category === undefined) {
      patch.category = categoryId != null ? await getCategoryNameArById(categoryId) : null;
    }

    await updateProduct(id, patch);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.get("/api/admin/sizes", requireAdmin, async (req, res) => {
  try {
    const category = req.query.category ? String(req.query.category) : null;
    res.json(await getSizes(category));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

/** تصنيفات + أقسام فرعية (شجرة للإدارة) */
app.get("/api/admin/categories", requireAdmin, async (req, res) => {
  try {
    const activeOnly = req.query.activeOnly === "1" || req.query.activeOnly === "true";
    res.json(await listCategoriesTree(!activeOnly));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.post("/api/admin/categories", requireAdmin, async (req, res) => {
  try {
    const row = toCategoryRow(req.body || {});
    if (!row.name_ar) return res.status(400).json({ error: "اسم التصنيف بالعربية مطلوب" });
    if (!isValidSlug(row.slug)) return res.status(400).json({ error: "المعرف slug لاتيني صغير وأرقام وشرطات فقط" });
    const id = await createCategory(row);
    res.status(201).json({ id });
  } catch (e) {
    if (e.code === "23505" || e.message?.includes("UNIQUE")) {
      return res.status(409).json({ error: "معرف slug مستخدم مسبقاً" });
    }
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.patch("/api/admin/categories/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "معرف غير صالح" });
    const body = req.body || {};
    const patch = {};
    if (body.nameAr !== undefined) patch.name_ar = String(body.nameAr).trim();
    if (body.nameEn !== undefined) patch.name_en = body.nameEn == null ? null : String(body.nameEn).trim();
    if (body.slug !== undefined) {
      const s = String(body.slug).trim().toLowerCase();
      if (!isValidSlug(s)) return res.status(400).json({ error: "slug غير صالح" });
      patch.slug = s;
    }
    if (body.descriptionAr !== undefined) patch.description_ar = body.descriptionAr == null ? null : String(body.descriptionAr).trim();
    if (body.imageUrl !== undefined) patch.image_url = body.imageUrl == null ? null : String(body.imageUrl).trim() || null;
    if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder) || 0;
    if (body.isActive !== undefined) patch.is_active = body.isActive === false || body.isActive === 0 ? 0 : 1;
    await updateCategory(id, patch);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === "23505" || e.message?.includes("UNIQUE")) {
      return res.status(409).json({ error: "معرف slug مستخدم مسبقاً" });
    }
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.post("/api/admin/categories/:categoryId/sections", requireAdmin, async (req, res) => {
  try {
    const categoryId = Number(req.params.categoryId);
    if (!Number.isFinite(categoryId)) return res.status(400).json({ error: "معرف التصنيف غير صالح" });
    const row = toSectionRow(req.body || {});
    if (!row.name_ar) return res.status(400).json({ error: "اسم القسم بالعربية مطلوب" });
    if (!isValidSlug(row.slug)) return res.status(400).json({ error: "slug غير صالح" });
    const id = await createSection(categoryId, row);
    res.status(201).json({ id });
  } catch (e) {
    if (e.code === "23505" || e.message?.includes("UNIQUE")) {
      return res.status(409).json({ error: "هذا slug مستخدم ضمن نفس التصنيف" });
    }
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.patch("/api/admin/sections/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "معرف غير صالح" });
    const body = req.body || {};
    const patch = {};
    if (body.nameAr !== undefined) patch.name_ar = String(body.nameAr).trim();
    if (body.nameEn !== undefined) patch.name_en = body.nameEn == null ? null : String(body.nameEn).trim();
    if (body.slug !== undefined) {
      const s = String(body.slug).trim().toLowerCase();
      if (!isValidSlug(s)) return res.status(400).json({ error: "slug غير صالح" });
      patch.slug = s;
    }
    if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder) || 0;
    if (body.isActive !== undefined) patch.is_active = body.isActive === false || body.isActive === 0 ? 0 : 1;
    if (body.categoryId !== undefined) {
      const cid = Number(body.categoryId);
      if (!Number.isFinite(cid)) return res.status(400).json({ error: "معرف التصنيف غير صالح" });
      const name = await getCategoryNameArById(cid);
      if (!name) return res.status(404).json({ error: "التصنيف غير موجود" });
      patch.category_id = cid;
    }
    await updateSection(id, patch);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === "23505" || e.message?.includes("UNIQUE")) {
      return res.status(409).json({ error: "slug مكرر ضمن التصنيف" });
    }
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.delete("/api/admin/categories/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "معرف غير صالح" });
    await deleteCategory(id);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === "HAS_PRODUCTS") {
      return res.status(409).json({ error: "لا يمكن حذف التصنيف: توجد منتجات مرتبطة به. انقلها أو أزل الربط أولاً." });
    }
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

app.delete("/api/admin/sections/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "معرف غير صالح" });
    await deleteSection(id);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === "HAS_PRODUCTS") {
      return res.status(409).json({ error: "لا يمكن حذف القسم: توجد منتجات مرتبطة به." });
    }
    console.error(e);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

const server = app.listen(PORT, () => {
  console.log(`API: http://127.0.0.1:${PORT}`);
});
server.on("error", (err) => {
  console.error("خطأ في خادم HTTP:", err.message);
  process.exit(1);
});
