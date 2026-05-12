/**
 * بيانات لوحة الإدارة مباشرة من Supabase (GitHub Pages + RLS) — بدون Express.
 */
import { getSupabaseBrowser, isSupabaseAuthConfigured, clearAdminSessionAndSupabase } from "./supabaseAuth.js";

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

/** جلسة مسؤول نشط أو إعادة توجيه لتسجيل الدخول */
export async function ensureActiveAdminSession() {
  if (!isSupabaseAuthConfigured()) {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
    return null;
  }
  const sb = getSupabaseBrowser();
  if (!sb) {
    window.location.href = "./login.html";
    return null;
  }
  const {
    data: { user },
    error: uerr,
  } = await sb.auth.getUser();
  if (uerr || !user) {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
    return null;
  }
  const { data: prof, error: perr } = await sb
    .from("admin_profiles")
    .select("role,is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (perr || !prof?.is_active) {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
    return null;
  }
  return { sb, user, role: prof.role };
}

export async function fetchAdminSessionJson() {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  return {
    email: ctx.user.email,
    role: ctx.role,
    source: "admin_profile",
  };
}

export async function fetchDashboardPayload() {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const { data: statsRow, error: sErr } = await sb.rpc("admin_dashboard_stats");
  if (sErr) throw new Error(sErr.message || "فشل تحميل الإحصائيات");
  const stats = {
    totalOrders: Number(statsRow?.totalOrders) || 0,
    revenueIQD: Number(statsRow?.revenueIQD) || 0,
    products: Number(statsRow?.products) || 0,
    newCustomers: Number(statsRow?.newCustomers) || 0,
  };
  const { data: rows, error: oErr } = await sb
    .from("orders")
    .select("id, order_ref, customer_name, total_iqd, status, created_at")
    .order("created_at", { ascending: false })
    .limit(8);
  if (oErr) throw new Error(oErr.message || "فشل تحميل الطلبات");
  const recentOrders = (rows || []).map((r) => ({
    id: Number(r.id),
    orderRef: r.order_ref != null ? String(r.order_ref) : "",
    customerName: r.customer_name != null ? String(r.customer_name) : "",
    totalIqd: Number(r.total_iqd) || 0,
    status: r.status != null ? String(r.status) : "pending",
    initials: initialsFromName(r.customer_name || ""),
    statusLabelAr: statusLabelAr[r.status] || r.status,
    statusType: mapStatusType(r.status),
  }));
  return { stats, recentOrders };
}

export async function fetchOrdersStats() {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const statuses = ["pending", "processing", "shipped", "delivered", "cancelled"];
  const by = { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
  for (const st of statuses) {
    const { count, error } = await sb.from("orders").select("id", { count: "exact", head: true }).eq("status", st);
    if (error) throw new Error(error.message);
    by[st] = count ?? 0;
  }
  return by;
}

export async function fetchOrdersList() {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const { data: rows, error } = await sb
    .from("orders")
    .select("id, order_ref, customer_name, customer_city, summary, total_iqd, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (rows || []).map((r) => ({
    id: Number(r.id),
    orderRef: r.order_ref != null ? String(r.order_ref) : "",
    customerName: r.customer_name != null ? String(r.customer_name) : "",
    customerCity: r.customer_city != null ? String(r.customer_city) : "",
    summary: r.summary != null ? String(r.summary) : "",
    totalIqd: Number(r.total_iqd) || 0,
    status: r.status != null ? String(r.status) : "pending",
    createdAt: r.created_at,
    initials: initialsFromName(r.customer_name || ""),
    statusLabelAr: statusLabelAr[r.status] || r.status,
  }));
}

export async function fetchProductsStats() {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const { count: total, error: e1 } = await sb.from("products").select("id", { count: "exact", head: true });
  if (e1) throw new Error(e1.message);
  const { count: inStock, error: e2 } = await sb
    .from("products")
    .select("id", { count: "exact", head: true })
    .gt("stock", 0)
    .eq("is_active", 1);
  if (e2) throw new Error(e2.message);
  const { count: lowStock, error: e3 } = await sb
    .from("products")
    .select("id", { count: "exact", head: true })
    .gt("stock", 0)
    .lt("stock", 10)
    .eq("is_active", 1);
  if (e3) throw new Error(e3.message);
  const { data: rows, error: e4 } = await sb.from("products").select("price_iqd, stock").eq("is_active", 1);
  if (e4) throw new Error(e4.message);
  let inventoryValueIqd = 0;
  for (const r of rows || []) {
    inventoryValueIqd += (Number(r.price_iqd) || 0) * (Number(r.stock) || 0);
  }
  return { total: total ?? 0, inStock: inStock ?? 0, lowStock: lowStock ?? 0, inventoryValueIqd };
}

async function categorySectionNameMaps(sb) {
  const [{ data: cats }, { data: secs }] = await Promise.all([
    sb.from("categories").select("id,name_ar"),
    sb.from("category_sections").select("id,name_ar"),
  ]);
  const catMap = new Map((cats || []).map((c) => [Number(c.id), c.name_ar]));
  const secMap = new Map((secs || []).map((s) => [Number(s.id), s.name_ar]));
  return { catMap, secMap };
}

export async function fetchProductsList() {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const { data: products, error } = await sb.from("products").select("*").order("id", { ascending: false });
  if (error) throw new Error(error.message);
  const { catMap, secMap } = await categorySectionNameMaps(sb);
  return (products || []).map((p) => ({
    id: Number(p.id),
    nameAr: p.name_ar ?? "",
    nameEn: p.name_en ?? null,
    category: p.category ?? null,
    sku: p.sku ?? null,
    priceIqd: Number(p.price_iqd) || 0,
    stock: Number(p.stock) || 0,
    isActive: p.is_active,
    imageUrl: p.image_url ?? null,
    categoryId: p.category_id != null ? Number(p.category_id) : null,
    sectionId: p.section_id != null ? Number(p.section_id) : null,
    categoryNameAr: p.category_id != null ? catMap.get(Number(p.category_id)) ?? null : null,
    sectionNameAr: p.section_id != null ? secMap.get(Number(p.section_id)) ?? null : null,
  }));
}

export async function createProduct(body) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const row = {
    name_ar: String(body.nameAr ?? "").trim(),
    name_en: body.nameEn != null && String(body.nameEn).trim() !== "" ? String(body.nameEn).trim() : null,
    category: body.category != null ? String(body.category).trim() || null : null,
    sku: body.sku != null ? String(body.sku).trim() || null : null,
    price_iqd: Number(body.priceIqd) || 0,
    stock: Math.floor(Number(body.stock) || 0),
    is_active: body.isActive === false || body.isActive === 0 ? 0 : 1,
    image_url: body.imageUrl != null && String(body.imageUrl).trim() !== "" ? String(body.imageUrl).trim() : null,
    category_id: body.categoryId != null ? Number(body.categoryId) : null,
    section_id: body.sectionId != null ? Number(body.sectionId) : null,
  };
  const { data, error } = await sb.from("products").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  return data?.id;
}

export async function updateProduct(id, body) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const patch = {};
  if (body.nameAr !== undefined) patch.name_ar = String(body.nameAr ?? "").trim();
  if (body.nameEn !== undefined) patch.name_en = body.nameEn == null ? null : String(body.nameEn).trim();
  if (body.category !== undefined) patch.category = body.category == null ? null : String(body.category).trim();
  if (body.sku !== undefined) patch.sku = body.sku == null ? null : String(body.sku).trim();
  if (body.priceIqd !== undefined) patch.price_iqd = Number(body.priceIqd) || 0;
  if (body.stock !== undefined) patch.stock = Math.floor(Number(body.stock) || 0);
  if (body.isActive !== undefined) patch.is_active = body.isActive === false || body.isActive === 0 ? 0 : 1;
  if (body.imageUrl !== undefined) patch.image_url = body.imageUrl == null ? null : String(body.imageUrl).trim();
  if (body.categoryId !== undefined) patch.category_id = body.categoryId == null ? null : Number(body.categoryId);
  if (body.sectionId !== undefined) patch.section_id = body.sectionId == null ? null : Number(body.sectionId);
  const { error } = await sb.from("products").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchSizesList(category) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  let q = sb.from("size_templates").select("id, category, label, is_active, sort_order").order("category").order("sort_order");
  if (category) q = q.eq("category", String(category));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    id: Number(r.id),
    category: r.category,
    label: r.label,
    isActive: r.is_active,
    sortOrder: Number(r.sort_order) || 0,
  }));
}

function nestSections(cats, secs) {
  const byCat = new Map();
  for (const c of cats) {
    byCat.set(Number(c.id), {
      id: Number(c.id),
      nameAr: c.name_ar,
      nameEn: c.name_en,
      slug: c.slug,
      descriptionAr: c.description_ar,
      imageUrl: c.image_url ?? null,
      sortOrder: Number(c.sort_order) || 0,
      isActive: c.is_active,
      sections: [],
    });
  }
  for (const s of secs) {
    const cid = Number(s.category_id);
    if (byCat.has(cid)) {
      byCat.get(cid).sections.push({
        id: Number(s.id),
        categoryId: cid,
        nameAr: s.name_ar,
        nameEn: s.name_en,
        slug: s.slug,
        sortOrder: Number(s.sort_order) || 0,
        isActive: s.is_active,
      });
    }
  }
  return Array.from(byCat.values());
}

export async function fetchCategoriesTree(activeOnly) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  let catQ = sb.from("categories").select("*").order("sort_order", { ascending: true }).order("id", { ascending: true });
  if (activeOnly) catQ = catQ.eq("is_active", 1);
  const { data: cats, error: ce } = await catQ;
  if (ce) throw new Error(ce.message);
  const list = cats || [];
  if (!list.length) return [];
  const ids = list.map((c) => Number(c.id));
  let secQ = sb
    .from("category_sections")
    .select("*")
    .in("category_id", ids)
    .order("category_id")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (activeOnly) secQ = secQ.eq("is_active", 1);
  const { data: secs, error: se } = await secQ;
  if (se) throw new Error(se.message);
  return nestSections(list, secs || []);
}

export async function createCategory(body) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const slug = String(body.slug ?? "").trim().toLowerCase();
  if (!isValidSlug(slug)) throw new Error("المعرف slug لاتيني صغير وأرقام وشرطات فقط");
  const row = {
    name_ar: String(body.nameAr ?? "").trim(),
    name_en: body.nameEn != null && String(body.nameEn).trim() !== "" ? String(body.nameEn).trim() : null,
    slug,
    description_ar: body.descriptionAr != null && String(body.descriptionAr).trim() !== "" ? String(body.descriptionAr).trim() : null,
    image_url: body.imageUrl != null && String(body.imageUrl).trim() !== "" ? String(body.imageUrl).trim() : null,
    sort_order: body.sortOrder != null ? Number(body.sortOrder) || 0 : 0,
    is_active: body.isActive === false || body.isActive === 0 ? 0 : 1,
  };
  const { data, error } = await sb.from("categories").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505" || String(error.message).includes("duplicate")) {
      throw new Error("معرف slug مستخدم مسبقاً");
    }
    throw new Error(error.message);
  }
  return data?.id;
}

export async function updateCategory(id, body) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const patch = {};
  if (body.nameAr !== undefined) patch.name_ar = String(body.nameAr ?? "").trim();
  if (body.nameEn !== undefined) patch.name_en = body.nameEn == null ? null : String(body.nameEn).trim();
  if (body.slug !== undefined) {
    const s = String(body.slug).trim().toLowerCase();
    if (!isValidSlug(s)) throw new Error("slug غير صالح");
    patch.slug = s;
  }
  if (body.descriptionAr !== undefined) {
    patch.description_ar = body.descriptionAr == null ? null : String(body.descriptionAr).trim();
  }
  if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder) || 0;
  if (body.isActive !== undefined) patch.is_active = body.isActive === false || body.isActive === 0 ? 0 : 1;
  if (body.imageUrl !== undefined) {
    patch.image_url = body.imageUrl == null || String(body.imageUrl).trim() === "" ? null : String(body.imageUrl).trim();
  }
  const { error } = await sb.from("categories").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("معرف slug مستخدم مسبقاً");
    throw new Error(error.message);
  }
}

export async function createSection(categoryId, body) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const slug = String(body.slug ?? "").trim().toLowerCase();
  if (!isValidSlug(slug)) throw new Error("slug غير صالح");
  const row = {
    category_id: categoryId,
    name_ar: String(body.nameAr ?? "").trim(),
    name_en: body.nameEn != null && String(body.nameEn).trim() !== "" ? String(body.nameEn).trim() : null,
    slug,
    sort_order: body.sortOrder != null ? Number(body.sortOrder) || 0 : 0,
    is_active: body.isActive === false || body.isActive === 0 ? 0 : 1,
  };
  const { data, error } = await sb.from("category_sections").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505") throw new Error("هذا slug مستخدم ضمن نفس التصنيف");
    throw new Error(error.message);
  }
  return data?.id;
}

export async function updateSection(id, body) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const patch = {};
  if (body.nameAr !== undefined) patch.name_ar = String(body.nameAr ?? "").trim();
  if (body.nameEn !== undefined) patch.name_en = body.nameEn == null ? null : String(body.nameEn).trim();
  if (body.slug !== undefined) {
    const s = String(body.slug).trim().toLowerCase();
    if (!isValidSlug(s)) throw new Error("slug غير صالح");
    patch.slug = s;
  }
  if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder) || 0;
  if (body.isActive !== undefined) patch.is_active = body.isActive === false || body.isActive === 0 ? 0 : 1;
  if (body.categoryId !== undefined) patch.category_id = Number(body.categoryId);
  const { error } = await sb.from("category_sections").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("هذا slug مستخدم ضمن نفس التصنيف");
    throw new Error(error.message);
  }
  if (body.categoryId !== undefined) {
    await sb.from("products").update({ category_id: patch.category_id }).eq("section_id", id);
  }
}

export async function deleteCategory(id) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const { count, error: c1 } = await sb.from("products").select("id", { count: "exact", head: true }).eq("category_id", id);
  if (c1) throw new Error(c1.message);
  if ((count ?? 0) > 0) throw new Error("لا يمكن حذف التصنيف: توجد منتجات مرتبطة به.");
  const { error } = await sb.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteSection(id) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const { count, error: c1 } = await sb.from("products").select("id", { count: "exact", head: true }).eq("section_id", id);
  if (c1) throw new Error(c1.message);
  if ((count ?? 0) > 0) throw new Error("لا يمكن حذف القسم: توجد منتجات مرتبطة به.");
  const { error } = await sb.from("category_sections").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listAdminUsers() {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const { data, error } = await sb
    .from("admin_profiles")
    .select("user_id,email,role,is_active,created_at,updated_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    userId: r.user_id,
    email: r.email,
    role: r.role,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function insertAdminUser({ userId, email, role }) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const row = {
    user_id: userId,
    email: email && String(email).trim() ? String(email).trim().toLowerCase() : null,
    role: String(role || "admin"),
    is_active: true,
  };
  const { data, error } = await sb.from("admin_profiles").insert(row).select("user_id,email,role,is_active,created_at").maybeSingle();
  if (error) {
    const msg = String(error.message || "");
    if (error.code === "23505" || msg.includes("duplicate")) {
      throw new Error("هذا المستخدم مربوط مسبقاً بجدول الصلاحيات.");
    }
    if (msg.includes("FIRST_MUST_BE_SUPER_ADMIN")) {
      throw new Error("أول مسؤول يُربَط في النظام يجب أن يكون super_admin (مسؤول أعلى). بعدها يمكن إضافة مسؤولين بدور admin.");
    }
    if (msg.includes("AUTH_USER_NOT_FOUND")) {
      throw new Error("لا يوجد مستخدم بهذا المعرف في Authentication. أنشئ الحساب أولاً في Supabase → Authentication → Users ثم انسخ User UID.");
    }
    throw new Error(msg || "فشل الإضافة");
  }
  return {
    userId: data.user_id,
    email: data.email,
    role: data.role,
    isActive: data.is_active,
    createdAt: data.created_at,
  };
}

export async function patchAdminUser(userId, { role, isActive }) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const patch = {};
  if (role !== undefined) patch.role = String(role);
  if (isActive !== undefined) patch.is_active = Boolean(isActive);
  const { data, error } = await sb
    .from("admin_profiles")
    .update(patch)
    .eq("user_id", userId)
    .select("user_id,email,role,is_active,updated_at")
    .maybeSingle();
  if (error) {
    const msg = String(error.message || "");
    if (msg.includes("LAST_SUPER_ADMIN")) {
      throw new Error("يجب أن يبقى مسؤول أعلى واحد على الأقل نشطاً (super_admin).");
    }
    throw new Error(msg || "فشل الحفظ");
  }
  if (!data) throw new Error("المسؤول غير موجود");
  return {
    userId: data.user_id,
    email: data.email,
    role: data.role,
    isActive: data.is_active,
    updatedAt: data.updated_at,
  };
}

export async function deleteAdminUser(userId, selfId) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  if (userId === selfId) throw new Error("لا يمكنك حذف صلاحياتك أنت بهذه الطريقة.");
  const { sb } = ctx;
  const { error } = await sb.from("admin_profiles").delete().eq("user_id", userId);
  if (error) {
    const msg = String(error.message || "");
    if (msg.includes("LAST_SUPER_ADMIN")) {
      throw new Error("لا يمكن حذف ربط آخر مسؤول أعلى نشط.");
    }
    throw new Error(msg || "فشل الحذف");
  }
}

const CATEGORY_IMAGES_BUCKET = "category-images";
const CATEGORY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CATEGORY_IMAGE_MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function categoryImageExtFromFile(file) {
  const mime = String(file.type || "").toLowerCase();
  if (CATEGORY_IMAGE_MIME_TO_EXT[mime]) return CATEGORY_IMAGE_MIME_TO_EXT[mime];
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".webp")) return "webp";
  if (name.endsWith(".gif")) return "gif";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  return "jpg";
}

function normalizeCategoryImageMime(file) {
  const mime = String(file.type || "").toLowerCase();
  if (mime && Object.prototype.hasOwnProperty.call(CATEGORY_IMAGE_MIME_TO_EXT, mime)) return mime;
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "";
}

/**
 * رفع صورة غلاف تصنيف إلى Supabase Storage وإرجاع الرابط العام (يُخزَّن في categories.image_url).
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function uploadCategoryCoverImage(file) {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("اختر ملف صورة صالحاً");
  }
  if (file.size > CATEGORY_IMAGE_MAX_BYTES) {
    throw new Error("حجم الصورة يتجاوز ٥ ميغابايت");
  }
  const mime = normalizeCategoryImageMime(file);
  if (!mime || !Object.prototype.hasOwnProperty.call(CATEGORY_IMAGE_MIME_TO_EXT, mime)) {
    throw new Error("الصيغ المسموحة: JPEG أو PNG أو WebP أو GIF");
  }
  const ctx = await ensureActiveAdminSession();
  if (!ctx) throw new Error("انتهت الجلسة — سجّل الدخول مجدداً");
  const { sb } = ctx;
  const ext = categoryImageExtFromFile(file);
  const path = `covers/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await sb.storage.from(CATEGORY_IMAGES_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: mime,
  });
  if (upErr) {
    const m = String(upErr.message || "");
    if (m.includes("Bucket not found") || m.includes("not found")) {
      throw new Error("دلو التخزين غير مُنشأ — نفّذ npm run db:push لهجرة التخزين.");
    }
    throw new Error(m || "فشل الرفع");
  }
  const { data } = sb.storage.from(CATEGORY_IMAGES_BUCKET).getPublicUrl(path);
  const url = data?.publicUrl;
  if (!url) throw new Error("تعذر الحصول على رابط الصورة");
  return url;
}
