import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getPool } from "./db.js";

const SESSION_DAYS = 30;

export function normalizeStorePhone(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("964") && d.length >= 12) d = `0${d.slice(3)}`;
  else if (d.length === 10 && d.startsWith("7")) d = `0${d}`;
  return d;
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(String(password), salt, 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function newSessionToken() {
  return randomBytes(32).toString("hex");
}

export async function registerStoreCustomer({ phone, name, password }) {
  const phoneNorm = normalizeStorePhone(phone);
  const nameAr = String(name || "").trim();
  const pass = String(password || "");

  if (phoneNorm.length < 10) throw Object.assign(new Error("رقم الهاتف غير صالح"), { code: "INVALID_PHONE" });
  if (nameAr.length < 2) throw Object.assign(new Error("الاسم قصير جداً"), { code: "INVALID_NAME" });
  if (pass.length < 6) throw Object.assign(new Error("كلمة المرور 6 أحرف على الأقل"), { code: "WEAK_PASSWORD" });

  const pool = getPool();
  const existing = await pool.query(`select id from public.store_customers where phone = $1 limit 1`, [phoneNorm]);
  if (existing.rows.length) {
    throw Object.assign(new Error("رقم الهاتف مسجّل مسبقاً — سجّل الدخول"), { code: "PHONE_EXISTS" });
  }

  const passwordHash = hashPassword(pass);
  const { rows } = await pool.query(
    `insert into public.store_customers (phone, name_ar, password_hash)
     values ($1, $2, $3)
     returning id, phone, name_ar`,
    [phoneNorm, nameAr, passwordHash],
  );
  return rows[0];
}

export async function loginStoreCustomer({ phone, password }) {
  const phoneNorm = normalizeStorePhone(phone);
  const pass = String(password || "");
  if (phoneNorm.length < 10 || !pass) {
    throw Object.assign(new Error("بيانات الدخول غير صحيحة"), { code: "INVALID_CREDENTIALS" });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `select id, phone, name_ar, password_hash, is_active
     from public.store_customers where phone = $1 limit 1`,
    [phoneNorm],
  );
  const row = rows[0];
  if (!row || row.is_active !== 1 || !verifyPassword(pass, row.password_hash)) {
    throw Object.assign(new Error("رقم الهاتف أو كلمة المرور غير صحيحة"), { code: "INVALID_CREDENTIALS" });
  }

  const token = newSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    `insert into public.store_customer_sessions (customer_id, token_hash, expires_at) values ($1, $2, $3)`,
    [row.id, tokenHash, expiresAt.toISOString()],
  );

  return {
    token,
    expiresAt: expiresAt.toISOString(),
    customer: { id: Number(row.id), phone: row.phone, nameAr: row.name_ar },
  };
}

export async function logoutStoreCustomer(token) {
  if (!token) return;
  const pool = getPool();
  await pool.query(`delete from public.store_customer_sessions where token_hash = $1`, [hashToken(token)]);
}

export async function resolveStoreCustomerSession(token) {
  if (!token) return null;
  const pool = getPool();
  const { rows } = await pool.query(
    `select sc.id, sc.phone, sc.name_ar, sc.is_active, s.expires_at
     from public.store_customer_sessions s
     join public.store_customers sc on sc.id = s.customer_id
     where s.token_hash = $1
     limit 1`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;
  if (row.is_active !== 1 || new Date(row.expires_at) < new Date()) {
    await pool.query(`delete from public.store_customer_sessions where token_hash = $1`, [hashToken(token)]);
    return null;
  }
  return { id: Number(row.id), phone: row.phone, nameAr: row.name_ar };
}

export async function listStoreCustomerOrders(customerId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `select id, order_ref, customer_name, customer_city, summary, total_iqd, status, created_at
     from public.orders
     where store_customer_id = $1
     order by created_at desc, id desc
     limit 100`,
    [customerId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    orderRef: r.order_ref,
    customerName: r.customer_name,
    customerCity: r.customer_city,
    summary: r.summary,
    totalIqd: Number(r.total_iqd) || 0,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export function extractBearerToken(req) {
  const h = req.headers.authorization;
  if (!h || typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}
