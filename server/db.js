import dns from "node:dns";
import { lookup, resolve4 } from "node:dns/promises";

/** @type {import('pg').Pool | null} */
let pool = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isIpv4Host(hostname) {
  return Boolean(hostname && /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname));
}

/** إن كان DNS المحلي لا يحلّ أسماء Supabase جرّب DATABASE_FORCE_PUBLIC_DNS=1 في .env */
function maybeUsePublicDns() {
  const v = String(process.env.DATABASE_FORCE_PUBLIC_DNS || "").trim();
  if (/^(1|true|yes)$/i.test(v)) {
    dns.setServers(["1.1.1.1", "8.8.8.8"]);
  }
}

/**
 * يحل اسم المضيف إلى عنوان IPv4 (سجلات A) مع إعادة محاولة — يتجاوز ENOTFOUND/تعثر lookup العادي على Windows.
 */
async function resolveHostToIpv4(host) {
  const retries = Math.min(8, Math.max(1, Number(process.env.DATABASE_DNS_RETRIES) || 3));
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const list = await resolve4(host);
      if (list?.length) return list[0];
    } catch {
      /* لا سجلات A أو DNS مؤقت */
    }
    try {
      const all = await lookup(host, { all: true, verbatim: true });
      const v4 = all.find((x) => x.family === 4);
      if (v4?.address) return v4.address;
    } catch {
      /* ignore */
    }
    try {
      const { address } = await lookup(host, { family: 4, verbatim: true });
      if (address) return address;
    } catch {
      /* ignore */
    }
    if (attempt < retries - 1) await sleep(350);
  }
  throw new Error(`no_ipv4_for_host:${host}`);
}

/**
 * يحل اسم المضيف إلى IPv4 ويستبدله في الرابط — يتجاوز ETIMEDOUT على مسارات IPv6.
 * عند الاتصال بالعنوان الرقمي يُمرَّر servername لـ TLS ليطابق شهادة Supabase.
 */
async function resolveDatabaseUrlPreferIpv4(urlString) {
  if (!urlString || urlString.includes("localhost") || urlString.includes("127.0.0.1") || urlString.includes("unix:")) {
    return { connectionString: urlString, tlsServerName: null };
  }
  maybeUsePublicDns();
  const wasPostgresql = /^postgresql:/i.test(urlString);
  const parseable = urlString.replace(/^postgresql:/i, "postgres:");
  let u;
  try {
    u = new URL(parseable);
  } catch {
    return { connectionString: urlString, tlsServerName: null };
  }
  const host = u.hostname;
  if (!host || isIpv4Host(host)) {
    return { connectionString: urlString, tlsServerName: null };
  }
  const prevDns = dns.getServers();
  const tryResolveToIpv4 = async () => {
    const address = await resolveHostToIpv4(host);
    u.hostname = address;
    const rebuilt = wasPostgresql ? u.toString().replace(/^postgres:/i, "postgresql:") : u.toString();
    return { connectionString: rebuilt, tlsServerName: host };
  };
  try {
    return await tryResolveToIpv4();
  } catch (e1) {
    const triedPairs = [
      ["1.1.1.1", "8.8.8.8"],
      ["9.9.9.9", "149.112.112.112"],
    ];
    for (const pair of triedPairs) {
      try {
        dns.setServers(pair);
        const out = await tryResolveToIpv4();
        dns.setServers(prevDns.length ? prevDns : []);
        return out;
      } catch {
        /* جرّب الزوج التالي */
      }
    }
    dns.setServers(prevDns.length ? prevDns : []);
    for (const pair of triedPairs) {
      try {
        dns.setServers(pair);
        const { address } = await dns.promises.lookup(host, { family: 4, verbatim: true });
        if (address && isIpv4Host(address)) {
          u.hostname = address;
          const rebuilt = wasPostgresql ? u.toString().replace(/^postgres:/i, "postgresql:") : u.toString();
          dns.setServers(prevDns.length ? prevDns : []);
          console.log(`[db] اتصال Postgres عبر IPv4 (lookup): ${host} → ${address}`);
          return { connectionString: rebuilt, tlsServerName: host };
        }
      } catch {
        /* ignore */
      }
    }
    dns.setServers(prevDns.length ? prevDns : []);
    if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(host)) {
      const err = new Error(
        "لم يُعثر على عنوان IPv4 لـ db.*.supabase.co من هذه الشبكة (الاتصال بـ IPv6 يتعثر غالباً). افتح Supabase → Project Settings → Database → Connection string واختر Session pooler (أو Transaction) والصق الرابط في DATABASE_URL بدل الرابط المباشر.",
      );
      err.code = "SUPABASE_DB_IPV4_UNREACHABLE";
      throw err;
    }
    console.warn("[db] تعذر حل DATABASE_URL إلى IPv4 — يُستخدم الرابط الأصلي:", e1?.message || e1);
    console.warn(
      "[db] جرّب DATABASE_FORCE_PUBLIC_DNS=1، أو غيّر DATABASE_URL إلى Session pooler من Supabase → Database (يغيّر اسم المضيف غالباً إلى *.pooler.supabase.com).",
    );
    return { connectionString: urlString, tlsServerName: null };
  }
}

export async function initDb() {
  const raw = process.env.DATABASE_URL?.trim().replace(/^\uFEFF/, "");
  if (!raw) {
    const err = new Error(
      "DATABASE_URL غير مضبوط: أضف رابط Postgres (Supabase) في .env. تم إلغاء SQLite المحلي.",
    );
    err.code = "NO_DATABASE_URL";
    throw err;
  }
  const { Pool } = await import("pg");
  const { connectionString, tlsServerName } = await resolveDatabaseUrlPreferIpv4(raw);
  const useSsl = !raw.includes("localhost") && !raw.includes("127.0.0.1") && !raw.includes("unix:");
  const ssl = useSsl
    ? tlsServerName
      ? { rejectUnauthorized: false, servername: tlsServerName }
      : { rejectUnauthorized: false }
    : false;
  pool = new Pool({
    connectionString,
    ssl,
    connectionTimeoutMillis: Math.min(
      120_000,
      Math.max(5_000, Number(process.env.DATABASE_CONNECT_TIMEOUT_MS) || 25_000),
    ),
  });
  await pool.query("select 1");
  if (tlsServerName && connectionString !== raw) {
    console.log(`[db] تم حل المضيف إلى IPv4 للاتصال بـ Postgres (SNI: ${tlsServerName})`);
  }
}

export function getPool() {
  if (!pool) throw new Error("قاعدة البيانات غير مهيأة");
  return pool;
}

/** مخرجات `pg` (string / bigint / number) → رقم آمن لـ JSON */
function pgNum(v, fallback = 0) {
  if (v == null) return fallback;
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function getDashboard() {
  const totalOrders = pgNum((await getPool().query("SELECT COUNT(*)::int AS c FROM orders")).rows[0]?.c);
  const revenueIQD = pgNum(
    (await getPool().query("SELECT COALESCE(SUM(total_iqd), 0)::bigint AS s FROM orders WHERE status != 'cancelled'")).rows[0]?.s,
  );
  const products = pgNum((await getPool().query("SELECT COUNT(*)::int AS c FROM products")).rows[0]?.c);
  const newCustomers = pgNum((await getPool().query("SELECT COUNT(DISTINCT customer_name)::int AS c FROM orders")).rows[0]?.c);
  const { rows } = await getPool().query(
    `SELECT id, order_ref AS "orderRef", customer_name AS "customerName", total_iqd AS "totalIqd", status
     FROM orders ORDER BY created_at DESC LIMIT 8`,
  );
  const recentRows = rows.map((r) => ({
    id: pgNum(r.id),
    orderRef: r.orderRef != null ? String(r.orderRef) : "",
    customerName: r.customerName != null ? String(r.customerName) : "",
    totalIqd: pgNum(r.totalIqd),
    status: r.status != null ? String(r.status) : "pending",
  }));
  return { stats: { totalOrders, revenueIQD, products, newCustomers }, recentRows };
}

export async function getOrdersStats() {
  const by = { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
  const { rows } = await getPool().query("SELECT status, COUNT(*)::int AS c FROM orders GROUP BY status");
  for (const r of rows) {
    if (by[r.status] !== undefined) by[r.status] = r.c;
  }
  return by;
}

export async function getOrders() {
  const { rows } = await getPool().query(
    `SELECT id, order_ref AS "orderRef", customer_name AS "customerName", customer_city AS "customerCity",
            summary, total_iqd AS "totalIqd", status, created_at AS "createdAt"
     FROM orders ORDER BY created_at DESC`,
  );
  return rows;
}

export async function getProductsStats() {
  const total = (await getPool().query("SELECT COUNT(*)::int AS c FROM products")).rows[0].c;
  const inStock = (await getPool().query("SELECT COUNT(*)::int AS c FROM products WHERE stock > 0 AND is_active = 1")).rows[0].c;
  const lowStock = (await getPool().query("SELECT COUNT(*)::int AS c FROM products WHERE stock > 0 AND stock < 10 AND is_active = 1")).rows[0].c;
  const value = Number((await getPool().query("SELECT COALESCE(SUM(price_iqd * stock), 0)::bigint AS v FROM products WHERE is_active = 1")).rows[0].v);
  return { total, inStock, lowStock, inventoryValueIqd: value };
}

export async function getProducts() {
  const { rows } = await getPool().query(
    `SELECT p.id, p.name_ar AS "nameAr", p.name_en AS "nameEn", p.category, p.sku, p.price_iqd AS "priceIqd", p.stock,
            p.is_active AS "isActive", p.image_url AS "imageUrl", p.category_id AS "categoryId", p.section_id AS "sectionId",
            p.subsection_id AS "subsectionId",
            c.name_ar AS "categoryNameAr", s.name_ar AS "sectionNameAr", ss.name_ar AS "subsectionNameAr"
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN category_sections s ON p.section_id = s.id
     LEFT JOIN category_subsections ss ON p.subsection_id = ss.id
     ORDER BY p.id DESC`,
  );
  return rows;
}

export async function getProductById(id) {
  const pid = Number(id);
  if (!Number.isFinite(pid)) return null;
  const { rows } = await getPool().query(
    `SELECT id, name_ar, name_en, category, sku, price_iqd, stock, is_active, image_url, category_id, section_id, subsection_id FROM products WHERE id = $1`,
    [pid],
  );
  return rows[0] || null;
}

export async function getCategoryNameArById(categoryId) {
  const id = Number(categoryId);
  if (!Number.isFinite(id)) return null;
  const { rows } = await getPool().query(`SELECT name_ar FROM categories WHERE id = $1`, [id]);
  return rows[0]?.name_ar ?? null;
}

/**
 * @param {object} row
 * @param {string} row.name_ar
 * @param {string | null} [row.name_en]
 * @param {string | null} [row.category]
 * @param {string | null} [row.sku]
 * @param {number} row.price_iqd
 * @param {number} row.stock
 * @param {number} row.is_active
 * @param {string | null} [row.image_url]
 * @param {number | null} [row.category_id]
 * @param {number | null} [row.section_id]
 */
export async function createProduct(row) {
  const {
    name_ar,
    name_en = null,
    category = null,
    sku = null,
    price_iqd = 0,
    stock = 0,
    is_active = 1,
    image_url = null,
    category_id = null,
    section_id = null,
    subsection_id = null,
  } = row;
  const { rows } = await getPool().query(
    `INSERT INTO products (name_ar, name_en, category, sku, price_iqd, stock, is_active, image_url, category_id, section_id, subsection_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [name_ar, name_en, category, sku, price_iqd, stock, is_active, image_url, category_id, section_id, subsection_id],
  );
  return rows[0].id;
}

/**
 * @param {number} id
 * @param {object} patch
 */
export async function updateProduct(id, patch) {
  const pairs = [
    ["name_ar", patch.name_ar],
    ["name_en", patch.name_en],
    ["category", patch.category],
    ["sku", patch.sku],
    ["price_iqd", patch.price_iqd],
    ["stock", patch.stock],
    ["is_active", patch.is_active],
    ["image_url", patch.image_url],
    ["category_id", patch.category_id],
    ["section_id", patch.section_id],
    ["subsection_id", patch.subsection_id],
  ].filter(([, v]) => v !== undefined);
  if (!pairs.length) return;
  const sets = pairs.map(([k], idx) => `${k} = $${idx + 1}`).join(", ");
  const vals = pairs.map(([, v]) => v);
  vals.push(id);
  await getPool().query(`UPDATE products SET ${sets} WHERE id = $${vals.length}`, vals);
}

export async function getSizes(category) {
  if (category) {
    const { rows } = await getPool().query(
      `SELECT id, category, label, is_active AS "isActive", sort_order AS "sortOrder"
       FROM size_templates WHERE category = $1 ORDER BY sort_order`,
      [category],
    );
    return rows;
  }
  const { rows } = await getPool().query(
    `SELECT id, category, label, is_active AS "isActive", sort_order AS "sortOrder"
     FROM size_templates ORDER BY category, sort_order`,
  );
  return rows;
}

export async function listCategoriesTree(includeInactive = true) {
  const catSql = includeInactive
    ? `SELECT id, name_ar AS "nameAr", name_en AS "nameEn", slug, description_ar AS "descriptionAr", image_url AS "imageUrl", sort_order AS "sortOrder", is_active AS "isActive"
         FROM categories ORDER BY sort_order, id`
    : `SELECT id, name_ar AS "nameAr", name_en AS "nameEn", slug, description_ar AS "descriptionAr", image_url AS "imageUrl", sort_order AS "sortOrder", is_active AS "isActive"
         FROM categories WHERE is_active = 1 ORDER BY sort_order, id`;

  const { rows: cats } = await getPool().query(catSql);
  if (!cats.length) return [];
  const ids = cats.map((c) => c.id);
  const secSql = includeInactive
    ? `SELECT id, category_id AS "categoryId", name_ar AS "nameAr", name_en AS "nameEn", slug, image_url AS "imageUrl", sort_order AS "sortOrder", is_active AS "isActive"
         FROM category_sections WHERE category_id = ANY($1::bigint[]) ORDER BY category_id, sort_order, id`
    : `SELECT id, category_id AS "categoryId", name_ar AS "nameAr", name_en AS "nameEn", slug, image_url AS "imageUrl", sort_order AS "sortOrder", is_active AS "isActive"
         FROM category_sections WHERE category_id = ANY($1::bigint[]) AND is_active = 1 ORDER BY category_id, sort_order, id`;
  const { rows: secs } = await getPool().query(secSql, [ids]);
  const secIds = secs.map((s) => s.id);
  let subs = [];
  if (secIds.length) {
    const subSql = includeInactive
      ? `SELECT id, section_id AS "sectionId", name_ar AS "nameAr", name_en AS "nameEn", slug, sort_order AS "sortOrder", is_active AS "isActive"
           FROM category_subsections WHERE section_id = ANY($1::bigint[]) ORDER BY section_id, sort_order, id`
      : `SELECT id, section_id AS "sectionId", name_ar AS "nameAr", name_en AS "nameEn", slug, sort_order AS "sortOrder", is_active AS "isActive"
           FROM category_subsections WHERE section_id = ANY($1::bigint[]) AND is_active = 1 ORDER BY section_id, sort_order, id`;
    const { rows: subRows } = await getPool().query(subSql, [secIds]);
    subs = subRows;
  }
  return nestSections(cats, secs, subs);
}

function nestSections(cats, secs, subs = []) {
  const byCat = new Map();
  for (const c of cats) {
    byCat.set(c.id, { ...c, sections: [] });
  }
  const bySec = new Map();
  for (const s of secs) {
    const cid = s.categoryId ?? s.categoryid;
    if (byCat.has(cid)) {
      const row = { ...s, subsections: [] };
      byCat.get(cid).sections.push(row);
      bySec.set(row.id, row);
    }
  }
  for (const sub of subs) {
    const sid = sub.sectionId ?? sub.sectionid;
    if (bySec.has(sid)) bySec.get(sid).subsections.push(sub);
  }
  return Array.from(byCat.values());
}

export async function createCategory(row) {
  const { name_ar, name_en, slug, description_ar, image_url, sort_order, is_active } = row;
  const { rows } = await getPool().query(
    `INSERT INTO categories (name_ar, name_en, slug, description_ar, image_url, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [name_ar, name_en ?? null, slug, description_ar ?? null, image_url ?? null, sort_order ?? 0, is_active ?? 1],
  );
  return rows[0].id;
}

export async function updateCategory(id, patch) {
  const pairs = [
    ["name_ar", patch.name_ar],
    ["name_en", patch.name_en],
    ["slug", patch.slug],
    ["description_ar", patch.description_ar],
    ["image_url", patch.image_url],
    ["sort_order", patch.sort_order],
    ["is_active", patch.is_active],
  ].filter(([, v]) => v !== undefined);
  if (!pairs.length) return;
  const sets = pairs.map(([k], idx) => `${k} = $${idx + 1}`).join(", ");
  const vals = pairs.map(([, v]) => v);
  vals.push(id);
  await getPool().query(`UPDATE categories SET ${sets}, updated_at = now() WHERE id = $${vals.length}`, vals);
}

export async function createSection(categoryId, row) {
  const { name_ar, name_en, slug, image_url, sort_order, is_active } = row;
  const { rows } = await getPool().query(
    `INSERT INTO category_sections (category_id, name_ar, name_en, slug, image_url, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [categoryId, name_ar, name_en ?? null, slug, image_url ?? null, sort_order ?? 0, is_active ?? 1],
  );
  return rows[0].id;
}

export async function updateSection(id, patch) {
  const pairs = [
    ["name_ar", patch.name_ar],
    ["name_en", patch.name_en],
    ["slug", patch.slug],
    ["image_url", patch.image_url],
    ["sort_order", patch.sort_order],
    ["is_active", patch.is_active],
    ["category_id", patch.category_id],
  ].filter(([, v]) => v !== undefined);
  if (!pairs.length) return;
  const categoryMoved = patch.category_id !== undefined;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const sets = pairs.map(([k], idx) => `${k} = $${idx + 1}`).join(", ");
    const vals = pairs.map(([, v]) => v);
    vals.push(id);
    await client.query(`UPDATE category_sections SET ${sets}, updated_at = now() WHERE id = $${vals.length}`, vals);
    if (categoryMoved) {
      await client.query(`UPDATE products SET category_id = $1 WHERE section_id = $2`, [patch.category_id, id]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getCategoryBySlug(slug) {
  const { rows } = await getPool().query(`SELECT id FROM categories WHERE slug = $1`, [slug]);
  return rows[0] || null;
}

export async function getSectionByCategoryAndSlug(categoryId, slug) {
  const { rows } = await getPool().query(`SELECT id FROM category_sections WHERE category_id = $1 AND slug = $2`, [categoryId, slug]);
  return rows[0] || null;
}

export async function deleteCategory(id) {
  const pid = Number(id);
  if (!Number.isFinite(pid)) throw Object.assign(new Error("bad_id"), { code: "BAD_ID" });
  const { rows } = await getPool().query("SELECT COUNT(*)::int AS c FROM products WHERE category_id = $1", [pid]);
  if (rows[0].c > 0) throw Object.assign(new Error("HAS_PRODUCTS"), { code: "HAS_PRODUCTS" });
  await getPool().query("DELETE FROM categories WHERE id = $1", [pid]);
}

export async function deleteSection(id) {
  const sid = Number(id);
  if (!Number.isFinite(sid)) throw Object.assign(new Error("bad_id"), { code: "BAD_ID" });
  const { rows } = await getPool().query("SELECT COUNT(*)::int AS c FROM products WHERE section_id = $1", [sid]);
  if (rows[0].c > 0) throw Object.assign(new Error("HAS_PRODUCTS"), { code: "HAS_PRODUCTS" });
  await getPool().query("DELETE FROM category_sections WHERE id = $1", [sid]);
}

export async function createSubsection(sectionId, row) {
  const { name_ar, name_en, slug, sort_order, is_active } = row;
  const { rows } = await getPool().query(
    `INSERT INTO category_subsections (section_id, name_ar, name_en, slug, sort_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [sectionId, name_ar, name_en ?? null, slug, sort_order ?? 0, is_active ?? 1],
  );
  return rows[0].id;
}

export async function updateSubsection(id, patch) {
  const pairs = [
    ["name_ar", patch.name_ar],
    ["name_en", patch.name_en],
    ["slug", patch.slug],
    ["sort_order", patch.sort_order],
    ["is_active", patch.is_active],
    ["section_id", patch.section_id],
  ].filter(([, v]) => v !== undefined);
  if (!pairs.length) return;
  const sectionMoved = patch.section_id !== undefined;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const sets = pairs.map(([k], idx) => `${k} = $${idx + 1}`).join(", ");
    const vals = pairs.map(([, v]) => v);
    vals.push(id);
    await client.query(`UPDATE category_subsections SET ${sets}, updated_at = now() WHERE id = $${vals.length}`, vals);
    if (sectionMoved) {
      await client.query(`UPDATE products SET section_id = $1 WHERE subsection_id = $2`, [patch.section_id, id]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteSubsection(id) {
  const subId = Number(id);
  if (!Number.isFinite(subId)) throw Object.assign(new Error("bad_id"), { code: "BAD_ID" });
  const { rows } = await getPool().query("SELECT COUNT(*)::int AS c FROM products WHERE subsection_id = $1", [subId]);
  if (rows[0].c > 0) throw Object.assign(new Error("HAS_PRODUCTS"), { code: "HAS_PRODUCTS" });
  await getPool().query("DELETE FROM category_subsections WHERE id = $1", [subId]);
}

const ADMIN_ROLES = new Set(["super_admin", "admin"]);

/** @returns {{ userId: string, email: string, role: string, isActive: boolean, createdAt?: Date, updatedAt?: Date } | null} */
export async function getAdminProfileByUserId(userId) {
  if (!userId) return null;
  const { rows } = await getPool().query(
    `SELECT user_id AS "userId", email, role, is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM admin_profiles WHERE user_id = $1`,
    [userId],
  );
  return rows[0] || null;
}

export async function listAdminProfiles() {
  const { rows } = await getPool().query(
    `SELECT user_id AS "userId", email, role, is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM admin_profiles ORDER BY created_at ASC`,
  );
  return rows;
}

/** صف من auth.users (للتحقق قبل الإدراج في admin_profiles) */
export async function getAuthUserById(userId) {
  if (!userId) return null;
  const { rows } = await getPool().query(`SELECT id, email FROM auth.users WHERE id = $1`, [userId]);
  return rows[0] || null;
}

/**
 * @param {{ userId: string, email: string, role: string }} row
 */
export async function createAdminProfile(row) {
  const role = String(row.role || "admin");
  if (!ADMIN_ROLES.has(role)) throw Object.assign(new Error("bad_role"), { code: "BAD_ROLE" });
  const email = String(row.email || "").trim().toLowerCase();
  if (!email) throw Object.assign(new Error("bad_email"), { code: "BAD_EMAIL" });
  const { rows } = await getPool().query(
    `INSERT INTO admin_profiles (user_id, email, role, is_active)
     VALUES ($1, $2, $3, true)
     RETURNING user_id AS "userId", email, role, is_active AS "isActive", created_at AS "createdAt"`,
    [row.userId, email, role],
  );
  return rows[0];
}

/**
 * @param {string} userId
 * @param {{ role?: string, isActive?: boolean }} patch
 */
export async function updateAdminProfile(userId, patch) {
  const pairs = [];
  const vals = [];
  if (patch.role !== undefined) {
    const r = String(patch.role);
    if (!ADMIN_ROLES.has(r)) throw Object.assign(new Error("bad_role"), { code: "BAD_ROLE" });
    pairs.push(`role = $${pairs.length + 1}`);
    vals.push(r);
  }
  if (patch.isActive !== undefined) {
    pairs.push(`is_active = $${pairs.length + 1}`);
    vals.push(Boolean(patch.isActive));
  }
  if (!pairs.length) return null;
  pairs.push("updated_at = now()");
  vals.push(userId);
  const q = `UPDATE admin_profiles SET ${pairs.join(", ")} WHERE user_id = $${vals.length}
     RETURNING user_id AS "userId", email, role, is_active AS "isActive", updated_at AS "updatedAt"`;
  const { rows } = await getPool().query(q, vals);
  return rows[0] || null;
}

export async function deleteAdminProfile(userId) {
  const r = await getPool().query(`DELETE FROM admin_profiles WHERE user_id = $1`, [userId]);
  return (r.rowCount || 0) > 0;
}

export function getDbMode() {
  return "pg";
}
