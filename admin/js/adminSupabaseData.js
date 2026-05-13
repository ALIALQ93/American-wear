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

async function categorySectionSubsectionNameMaps(sb) {
  const [{ data: cats }, { data: secs }, { data: subs }] = await Promise.all([
    sb.from("categories").select("id,name_ar"),
    sb.from("category_sections").select("id,name_ar"),
    sb.from("category_subsections").select("id,name_ar"),
  ]);
  const catMap = new Map((cats || []).map((c) => [Number(c.id), c.name_ar]));
  const secMap = new Map((secs || []).map((s) => [Number(s.id), s.name_ar]));
  const subMap = new Map((subs || []).map((s) => [Number(s.id), s.name_ar]));
  return { catMap, secMap, subMap };
}

export async function fetchProductsList() {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const { data: products, error } = await sb.from("products").select("*").order("id", { ascending: false });
  if (error) throw new Error(error.message);
  const { catMap, secMap, subMap } = await categorySectionSubsectionNameMaps(sb);
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
    subsectionId: p.subsection_id != null ? Number(p.subsection_id) : null,
    categoryNameAr: p.category_id != null ? catMap.get(Number(p.category_id)) ?? null : null,
    sectionNameAr: p.section_id != null ? secMap.get(Number(p.section_id)) ?? null : null,
    subsectionNameAr: p.subsection_id != null ? subMap.get(Number(p.subsection_id)) ?? null : null,
    variantMode: p.variant_mode ?? "none",
    sizeSetId: p.size_set_id != null ? Number(p.size_set_id) : null,
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
    subsection_id: body.subsectionId != null ? Number(body.subsectionId) : null,
    variant_mode: body.variantMode != null ? String(body.variantMode) : "none",
    size_set_id: body.sizeSetId != null ? Number(body.sizeSetId) : null,
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
  if (body.subsectionId !== undefined) patch.subsection_id = body.subsectionId == null ? null : Number(body.subsectionId);
  if (body.variantMode !== undefined) patch.variant_mode = String(body.variantMode || "none");
  if (body.sizeSetId !== undefined) patch.size_set_id = body.sizeSetId == null ? null : Number(body.sizeSetId);
  const { error } = await sb.from("products").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/** @typedef {{ id?: number, nameAr: string, nameEn?: string|null, hexCode?: string|null, imageUrl?: string|null, sortOrder?: number }} InventoryColor */
/** @typedef {{ id?: number, colorIndex?: number|null, colorId?: number|null, sizeLabel?: string|null, sku?: string|null, stock: number }} InventoryVariant */

export async function fetchProductInventory(productId) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const pid = Number(productId);
  const { data: prod, error: pe } = await sb.from("products").select("variant_mode").eq("id", pid).maybeSingle();
  if (pe) throw new Error(pe.message);
  if (!prod) throw new Error("المنتج غير موجود");
  const [{ data: colorRows, error: ce }, { data: variantRows, error: ve }] = await Promise.all([
    sb.from("product_colors").select("*").eq("product_id", pid).order("sort_order", { ascending: true }).order("id", { ascending: true }),
    sb.from("product_variants").select("*").eq("product_id", pid).order("id", { ascending: true }),
  ]);
  if (ce) throw new Error(ce.message);
  if (ve) throw new Error(ve.message);
  const colors = (colorRows || []).map((c, i) => ({
    id: Number(c.id),
    presetId: c.preset_id != null ? Number(c.preset_id) : null,
    nameAr: c.name_ar ?? "",
    nameEn: c.name_en ?? null,
    hexCode: c.hex_code ?? null,
    imageUrl: c.image_url ?? null,
    sortOrder: Number(c.sort_order) || i,
  }));
  const colorIdToIndex = new Map(colors.map((c, i) => [c.id, i]));
  const variants = (variantRows || []).map((v) => ({
    id: Number(v.id),
    colorId: v.color_id != null ? Number(v.color_id) : null,
    colorIndex: v.color_id != null ? colorIdToIndex.get(Number(v.color_id)) ?? null : null,
    sizeLabel: v.size_label ?? null,
    sku: v.sku ?? null,
    stock: Number(v.stock) || 0,
  }));
  return { variantMode: prod.variant_mode || "none", colors, variants };
}

async function syncProductStockTotal(sb, productId) {
  const { data, error } = await sb.from("product_variants").select("stock").eq("product_id", productId);
  if (error) throw new Error(error.message);
  const total = (data || []).reduce((sum, r) => sum + (Number(r.stock) || 0), 0);
  const { error: uerr } = await sb.from("products").update({ stock: total }).eq("id", productId);
  if (uerr) throw new Error(uerr.message);
  return total;
}

/**
 * تعديل مخزون متغير: delta موجب = إضافة (restock)، delta سالب أو reason adjustment_down = خصم.
 * @param {number} variantId
 * @param {number} delta
 * @param {'restock'|'adjustment_down'} reason
 * @param {string|null} [note]
 */
export async function adjustVariantStock(variantId, delta, reason, note = null) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const vid = Number(variantId);
  const qty = Math.floor(Math.abs(Number(delta) || 0));
  if (!qty) throw new Error("أدخل كمية أكبر من صفر");
  const appliedDelta = reason === "adjustment_down" ? -qty : qty;
  const { data: v, error: verr } = await sb
    .from("product_variants")
    .select("id, product_id, stock")
    .eq("id", vid)
    .maybeSingle();
  if (verr) throw new Error(verr.message);
  if (!v) throw new Error("المتغير غير موجود");
  const current = Number(v.stock) || 0;
  const next = current + appliedDelta;
  if (next < 0) throw new Error(`المخزون الحالي ${current} — لا يمكن خصم ${qty}`);
  const { error: uerr } = await sb.from("product_variants").update({ stock: next }).eq("id", vid);
  if (uerr) throw new Error(uerr.message);
  const { error: merr } = await sb.from("stock_movements").insert({
    product_id: Number(v.product_id),
    variant_id: vid,
    delta: appliedDelta,
    reason: reason === "adjustment_down" ? "adjustment_down" : "restock",
    note: note != null && String(note).trim() !== "" ? String(note).trim() : null,
  });
  if (merr) throw new Error(merr.message);
  await syncProductStockTotal(sb, Number(v.product_id));
  return next;
}

function variantStockKey(variantMode, presetId, sizeLabel) {
  const mode = String(variantMode || "none");
  if (mode === "none") return "__none__";
  if (mode === "size_only") return `size:${sizeLabel || ""}`;
  if (mode === "color_only") return `color:${presetId ?? ""}`;
  if (mode === "color_size") return `cs:${presetId ?? ""}|${sizeLabel || ""}`;
  return "unknown";
}

async function saveProductInventoryPreserveStock(sb, pid, inventory) {
  const variantMode = String(inventory?.variantMode || "none");
  const colors = Array.isArray(inventory?.colors) ? inventory.colors : [];
  const variants = Array.isArray(inventory?.variants) ? inventory.variants : [];

  const [{ data: prod }, { data: oldColors }, { data: oldVariants }] = await Promise.all([
    sb.from("products").select("variant_mode").eq("id", pid).maybeSingle(),
    sb.from("product_colors").select("id, preset_id").eq("product_id", pid),
    sb.from("product_variants").select("color_id, size_label, stock").eq("product_id", pid),
  ]);
  const oldMode = prod?.variant_mode || "none";
  const oldColorIdToPreset = new Map(
    (oldColors || []).map((c) => [Number(c.id), c.preset_id != null ? Number(c.preset_id) : null]),
  );
  const stockByKey = new Map();
  for (const v of oldVariants || []) {
    const preset = v.color_id != null ? oldColorIdToPreset.get(Number(v.color_id)) ?? null : null;
    const key = variantStockKey(oldMode, preset, v.size_label ?? null);
    stockByKey.set(key, Number(v.stock) || 0);
  }

  const { error: modeErr } = await sb.from("products").update({ variant_mode: variantMode }).eq("id", pid);
  if (modeErr) throw new Error(modeErr.message);

  const { error: delVarErr } = await sb.from("product_variants").delete().eq("product_id", pid);
  if (delVarErr) throw new Error(delVarErr.message);
  const { error: delColErr } = await sb.from("product_colors").delete().eq("product_id", pid);
  if (delColErr) throw new Error(delColErr.message);

  const colorIdByIndex = [];
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    const nameAr = String(c.nameAr ?? "").trim();
    if (!nameAr) continue;
    const row = {
      product_id: pid,
      preset_id: c.presetId != null ? Number(c.presetId) : null,
      name_ar: nameAr,
      name_en: c.nameEn != null && String(c.nameEn).trim() !== "" ? String(c.nameEn).trim() : null,
      hex_code: c.hexCode != null && String(c.hexCode).trim() !== "" ? String(c.hexCode).trim() : null,
      image_url: c.imageUrl != null && String(c.imageUrl).trim() !== "" ? String(c.imageUrl).trim() : null,
      sort_order: i,
      is_active: 1,
    };
    const { data, error } = await sb.from("product_colors").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    colorIdByIndex[i] = Number(data.id);
  }

  const variantRows = [];
  for (const v of variants) {
    const colorIndex = v.colorIndex != null ? Number(v.colorIndex) : null;
    const presetId = colorIndex != null && colors[colorIndex] ? colors[colorIndex].presetId ?? null : null;
    const sizeLabel = v.sizeLabel != null && String(v.sizeLabel).trim() !== "" ? String(v.sizeLabel).trim() : null;
    const key = variantStockKey(variantMode, presetId, sizeLabel);
    const stock = stockByKey.has(key) ? stockByKey.get(key) : 0;
    const colorId = colorIndex != null && colorIdByIndex[colorIndex] != null ? colorIdByIndex[colorIndex] : null;
    variantRows.push({
      product_id: pid,
      color_id: colorId,
      size_label: sizeLabel,
      sku: v.sku != null && String(v.sku).trim() !== "" ? String(v.sku).trim() : null,
      stock: Math.max(0, Math.floor(Number(stock) || 0)),
      is_active: 1,
    });
  }
  if (variantRows.length) {
    const { error: insErr } = await sb.from("product_variants").insert(variantRows);
    if (insErr) throw new Error(insErr.message);
  }

  await syncProductStockTotal(sb, pid);
}

export async function saveProductInventory(productId, inventory, options = {}) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const pid = Number(productId);
  if (options?.preserveStock) {
    await saveProductInventoryPreserveStock(sb, pid, inventory);
    return;
  }
  const variantMode = String(inventory?.variantMode || "none");
  const colors = Array.isArray(inventory?.colors) ? inventory.colors : [];
  const variants = Array.isArray(inventory?.variants) ? inventory.variants : [];

  const { error: modeErr } = await sb.from("products").update({ variant_mode: variantMode }).eq("id", pid);
  if (modeErr) throw new Error(modeErr.message);

  const { error: delVarErr } = await sb.from("product_variants").delete().eq("product_id", pid);
  if (delVarErr) throw new Error(delVarErr.message);
  const { error: delColErr } = await sb.from("product_colors").delete().eq("product_id", pid);
  if (delColErr) throw new Error(delColErr.message);

  const colorIdByIndex = [];
  for (let i = 0; i < colors.length; i++) {
    const c = colors[i];
    const nameAr = String(c.nameAr ?? "").trim();
    if (!nameAr) continue;
    const row = {
      product_id: pid,
      preset_id: c.presetId != null ? Number(c.presetId) : null,
      name_ar: nameAr,
      name_en: c.nameEn != null && String(c.nameEn).trim() !== "" ? String(c.nameEn).trim() : null,
      hex_code: c.hexCode != null && String(c.hexCode).trim() !== "" ? String(c.hexCode).trim() : null,
      image_url: c.imageUrl != null && String(c.imageUrl).trim() !== "" ? String(c.imageUrl).trim() : null,
      sort_order: i,
      is_active: 1,
    };
    const { data, error } = await sb.from("product_colors").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    colorIdByIndex[i] = Number(data.id);
  }

  const variantRows = [];
  for (const v of variants) {
    const stock = Math.max(0, Math.floor(Number(v.stock) || 0));
    const colorIndex = v.colorIndex != null ? Number(v.colorIndex) : null;
    const colorId = colorIndex != null && colorIdByIndex[colorIndex] != null ? colorIdByIndex[colorIndex] : null;
    const sizeLabel = v.sizeLabel != null && String(v.sizeLabel).trim() !== "" ? String(v.sizeLabel).trim() : null;
    variantRows.push({
      product_id: pid,
      color_id: colorId,
      size_label: sizeLabel,
      sku: v.sku != null && String(v.sku).trim() !== "" ? String(v.sku).trim() : null,
      stock,
      is_active: 1,
    });
  }
  if (variantRows.length) {
    const { data: inserted, error: insErr } = await sb.from("product_variants").insert(variantRows).select("id, stock");
    if (insErr) throw new Error(insErr.message);
    for (const row of inserted || []) {
      const st = Number(row.stock) || 0;
      if (st > 0) {
        await sb.from("stock_movements").insert({
          product_id: pid,
          variant_id: Number(row.id),
          delta: st,
          reason: "initial",
          note: "مخزون أولي عند إنشاء المنتج",
        });
      }
    }
  }

  await syncProductStockTotal(sb, pid);
}

export async function saveProductWithInventory(body, inventory) {
  const editId = body.id != null ? Number(body.id) : NaN;
  if (Number.isFinite(editId)) {
    const patch = { ...body };
    delete patch.stock;
    await updateProduct(editId, patch);
    await saveProductInventory(editId, inventory, { preserveStock: true });
    return editId;
  }
  const productBody = { ...body, stock: 0 };
  const newId = await createProduct(productBody);
  if (!newId) throw new Error("تعذر إنشاء المنتج");
  await saveProductInventory(newId, inventory);
  return newId;
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

export async function fetchShippingGovernorates() {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const { data, error } = await sb
    .from("shipping_governorates")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    id: Number(r.id),
    nameAr: r.name_ar ?? "",
    nameEn: r.name_en ?? null,
    slug: r.slug ?? "",
    feeIqd: Number(r.fee_iqd) || 0,
    isMajor: r.is_major === 1 || r.is_major === true,
    sortOrder: Number(r.sort_order) || 0,
    isActive: r.is_active,
  }));
}

export async function updateShippingGovernorate(id, body) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const patch = {};
  if (body.feeIqd !== undefined) patch.fee_iqd = Math.max(0, Math.floor(Number(body.feeIqd) || 0));
  if (body.isActive !== undefined) patch.is_active = body.isActive === false || body.isActive === 0 ? 0 : 1;
  if (body.sortOrder !== undefined) patch.sort_order = Math.floor(Number(body.sortOrder) || 0);
  if (body.nameAr !== undefined) patch.name_ar = String(body.nameAr ?? "").trim();
  if (body.nameEn !== undefined) patch.name_en = body.nameEn == null ? null : String(body.nameEn).trim();
  const { error } = await sb.from("shipping_governorates").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

function nestSizeSetItems(sets, items) {
  const bySet = new Map();
  for (const s of sets) {
    bySet.set(Number(s.id), {
      id: Number(s.id),
      nameAr: s.name_ar,
      nameEn: s.name_en,
      slug: s.slug,
      sortOrder: Number(s.sort_order) || 0,
      isActive: s.is_active,
      items: [],
    });
  }
  for (const it of items) {
    const sid = Number(it.set_id);
    if (bySet.has(sid)) {
      bySet.get(sid).items.push({
        id: Number(it.id),
        label: it.label,
        sortOrder: Number(it.sort_order) || 0,
      });
    }
  }
  for (const row of bySet.values()) {
    row.items.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }
  return Array.from(bySet.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export async function fetchSizeSets(activeOnly = false) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  let q = sb.from("size_sets").select("*").order("sort_order", { ascending: true }).order("id", { ascending: true });
  if (activeOnly) q = q.eq("is_active", 1);
  const { data: sets, error: se } = await q;
  if (se) throw new Error(se.message);
  const list = sets || [];
  if (!list.length) return [];
  const ids = list.map((s) => Number(s.id));
  const { data: items, error: ie } = await sb
    .from("size_set_items")
    .select("*")
    .in("set_id", ids)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (ie) throw new Error(ie.message);
  return nestSizeSetItems(list, items || []);
}

export async function fetchSizeSetLabels(setId) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const sid = Number(setId);
  if (!Number.isFinite(sid)) return [];
  const { data, error } = await sb
    .from("size_set_items")
    .select("label, sort_order")
    .eq("set_id", sid)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => r.label);
}

export async function createSizeSet(body) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const slug = String(body.slug ?? "").trim().toLowerCase();
  if (!isValidSlug(slug)) throw new Error("slug غير صالح");
  const row = {
    name_ar: String(body.nameAr ?? "").trim(),
    name_en: body.nameEn != null && String(body.nameEn).trim() !== "" ? String(body.nameEn).trim() : null,
    slug,
    sort_order: Number(body.sortOrder) || 0,
    is_active: body.isActive === false || body.isActive === 0 ? 0 : 1,
  };
  const { data, error } = await sb.from("size_sets").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505") throw new Error("هذا slug مستخدم مسبقاً");
    throw new Error(error.message);
  }
  return Number(data.id);
}

export async function updateSizeSet(id, body) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const patch = {};
  if (body.nameAr !== undefined) patch.name_ar = String(body.nameAr ?? "").trim();
  if (body.nameEn !== undefined) patch.name_en = body.nameEn == null ? null : String(body.nameEn).trim();
  if (body.slug !== undefined) {
    const slug = String(body.slug).trim().toLowerCase();
    if (!isValidSlug(slug)) throw new Error("slug غير صالح");
    patch.slug = slug;
  }
  if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder) || 0;
  if (body.isActive !== undefined) patch.is_active = body.isActive === false || body.isActive === 0 ? 0 : 1;
  const { error } = await sb.from("size_sets").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("هذا slug مستخدم مسبقاً");
    throw new Error(error.message);
  }
}

export async function deleteSizeSet(id) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const { count, error: c1 } = await sb.from("products").select("id", { count: "exact", head: true }).eq("size_set_id", id);
  if (c1) throw new Error(c1.message);
  if ((count ?? 0) > 0) throw new Error("لا يمكن الحذف: منتجات مرتبطة بهذه المجموعة.");
  const { error } = await sb.from("size_sets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function saveSizeSetItems(setId, labels) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const sid = Number(setId);
  const { error: delErr } = await sb.from("size_set_items").delete().eq("set_id", sid);
  if (delErr) throw new Error(delErr.message);
  const rows = (labels || [])
    .map((label, i) => String(label || "").trim())
    .filter(Boolean)
    .map((label, i) => ({ set_id: sid, label, sort_order: i }));
  if (!rows.length) return;
  const { error } = await sb.from("size_set_items").insert(rows);
  if (error) {
    if (error.code === "23505") throw new Error("مقاس مكرر في نفس المجموعة");
    throw new Error(error.message);
  }
}

export async function fetchColorPresets(activeOnly = false) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  let q = sb.from("color_presets").select("*").order("sort_order", { ascending: true }).order("id", { ascending: true });
  if (activeOnly) q = q.eq("is_active", 1);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    id: Number(r.id),
    nameAr: r.name_ar ?? "",
    nameEn: r.name_en ?? null,
    hexCode: r.hex_code ?? "#888888",
    sortOrder: Number(r.sort_order) || 0,
    isActive: r.is_active,
  }));
}

export async function createColorPreset(body) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const hex = String(body.hexCode ?? "").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error("كود اللون بصيغة #RRGGBB");
  const row = {
    name_ar: String(body.nameAr ?? "").trim(),
    name_en: body.nameEn != null && String(body.nameEn).trim() !== "" ? String(body.nameEn).trim() : null,
    hex_code: hex,
    sort_order: Number(body.sortOrder) || 0,
    is_active: body.isActive === false || body.isActive === 0 ? 0 : 1,
  };
  const { data, error } = await sb.from("color_presets").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505") throw new Error("اسم اللون مستخدم مسبقاً");
    throw new Error(error.message);
  }
  return Number(data.id);
}

export async function updateColorPreset(id, body) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const patch = {};
  if (body.nameAr !== undefined) patch.name_ar = String(body.nameAr ?? "").trim();
  if (body.nameEn !== undefined) patch.name_en = body.nameEn == null ? null : String(body.nameEn).trim();
  if (body.hexCode !== undefined) {
    const hex = String(body.hexCode).trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error("كود اللون بصيغة #RRGGBB");
    patch.hex_code = hex;
  }
  if (body.sortOrder !== undefined) patch.sort_order = Number(body.sortOrder) || 0;
  if (body.isActive !== undefined) patch.is_active = body.isActive === false || body.isActive === 0 ? 0 : 1;
  const { error } = await sb.from("color_presets").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("اسم اللون مستخدم مسبقاً");
    throw new Error(error.message);
  }
}

export async function deleteColorPreset(id) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const { error } = await sb.from("color_presets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

function nestSections(cats, secs, subs = []) {
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
  const bySec = new Map();
  for (const s of secs) {
    const cid = Number(s.category_id);
    if (byCat.has(cid)) {
      const row = {
        id: Number(s.id),
        categoryId: cid,
        nameAr: s.name_ar,
        nameEn: s.name_en,
        slug: s.slug,
        imageUrl: s.image_url ?? null,
        sortOrder: Number(s.sort_order) || 0,
        isActive: s.is_active,
        subsections: [],
      };
      byCat.get(cid).sections.push(row);
      bySec.set(row.id, row);
    }
  }
  for (const sub of subs) {
    const sid = Number(sub.section_id);
    const sec = bySec.get(sid);
    if (sec) {
      sec.subsections.push({
        id: Number(sub.id),
        sectionId: sid,
        nameAr: sub.name_ar,
        nameEn: sub.name_en,
        slug: sub.slug,
        sortOrder: Number(sub.sort_order) || 0,
        isActive: sub.is_active,
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
  const secIds = (secs || []).map((s) => Number(s.id));
  let subs = [];
  if (secIds.length) {
    let subQ = sb
      .from("category_subsections")
      .select("*")
      .in("section_id", secIds)
      .order("section_id")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (activeOnly) subQ = subQ.eq("is_active", 1);
    const { data: subRows, error: subErr } = await subQ;
    if (subErr) throw new Error(subErr.message);
    subs = subRows || [];
  }
  return nestSections(list, secs || [], subs);
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
    image_url: body.imageUrl != null && String(body.imageUrl).trim() !== "" ? String(body.imageUrl).trim() : null,
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
  if (body.imageUrl !== undefined) {
    patch.image_url = body.imageUrl == null || String(body.imageUrl).trim() === "" ? null : String(body.imageUrl).trim();
  }
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

export async function createSubsection(sectionId, body) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const slug = String(body.slug ?? "").trim().toLowerCase();
  if (!isValidSlug(slug)) throw new Error("slug غير صالح");
  const row = {
    section_id: sectionId,
    name_ar: String(body.nameAr ?? "").trim(),
    name_en: body.nameEn != null && String(body.nameEn).trim() !== "" ? String(body.nameEn).trim() : null,
    slug,
    sort_order: body.sortOrder != null ? Number(body.sortOrder) || 0 : 0,
    is_active: body.isActive === false || body.isActive === 0 ? 0 : 1,
  };
  const { data, error } = await sb.from("category_subsections").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505") throw new Error("هذا slug مستخدم ضمن نفس القسم");
    throw new Error(error.message);
  }
  return data?.id;
}

export async function updateSubsection(id, body) {
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
  if (body.sectionId !== undefined) patch.section_id = Number(body.sectionId);
  const { error } = await sb.from("category_subsections").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("هذا slug مستخدم ضمن نفس القسم");
    throw new Error(error.message);
  }
  if (body.sectionId !== undefined) {
    await sb.from("products").update({ section_id: patch.section_id }).eq("subsection_id", id);
  }
}

export async function deleteSubsection(id) {
  const ctx = await ensureActiveAdminSession();
  if (!ctx) return null;
  const { sb } = ctx;
  const { count, error: c1 } = await sb.from("products").select("id", { count: "exact", head: true }).eq("subsection_id", id);
  if (c1) throw new Error(c1.message);
  if ((count ?? 0) > 0) throw new Error("لا يمكن حذف التصنيف الفرعي: توجد منتجات مرتبطة به.");
  const { error } = await sb.from("category_subsections").delete().eq("id", id);
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

/**
 * رفع صورة غلاف قسم فرعي إلى نفس دلو التصنيفات (`category-images/section-covers/…`).
 * يُخزَّن الرابط في `category_sections.image_url`.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function uploadSectionCoverImage(file) {
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
  const path = `section-covers/${crypto.randomUUID()}.${ext}`;
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
