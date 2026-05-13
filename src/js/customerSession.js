import { getStorefrontSupabase } from "../lib/supabase/storefrontClient.js";
import { storefrontFetch } from "./storefrontApi.js";

const STORAGE_KEY = "aw-store-customer";

/** @typedef {{ id: number, phone: string, nameAr: string }} StoreCustomer */

const RPC_ERROR_AR = {
  INVALID_PHONE: "رقم الهاتف غير صالح",
  INVALID_NAME: "الاسم قصير جداً",
  WEAK_PASSWORD: "كلمة المرور 6 أحرف على الأقل",
  PHONE_EXISTS: "رقم الهاتف مسجّل مسبقاً — سجّل الدخول",
  INVALID_CREDENTIALS: "رقم الهاتف أو كلمة المرور غير صحيحة",
  LEGACY_PASSWORD_HASH: "يُرجى إعادة تعيين كلمة المرور من الإدارة أو التواصل معنا",
  UNAUTHORIZED: "يجب تسجيل الدخول",
};

function readRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getCustomerToken() {
  return readRaw()?.token || null;
}

/** @returns {StoreCustomer | null} */
export function getCustomer() {
  const raw = readRaw();
  return raw?.customer || null;
}

export function setCustomerSession({ token, customer, expiresAt }) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token: String(token || ""),
      customer,
      expiresAt: expiresAt || null,
    }),
  );
  window.dispatchEvent(new CustomEvent("aw-customer-updated"));
}

export function clearCustomerSession() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("aw-customer-updated"));
}

function rpcErrorMessage(err) {
  const msg = String(err?.message || err || "");
  for (const [code, ar] of Object.entries(RPC_ERROR_AR)) {
    if (msg.includes(code)) return ar;
  }
  if (msg.includes("function") && msg.includes("does not exist")) {
    return "دوال حساب الزبون غير منشورة — نفّذ npm run db:push";
  }
  return msg || "طلب فاشل";
}

async function customerRpc(fn, args) {
  const sb = getStorefrontSupabase();
  if (!sb) {
    throw new Error("لم يُضبط Supabase في البناء (VITE_SUPABASE_URL ومفتاح عام)");
  }
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const e = new Error(rpcErrorMessage(error));
    e.code = error.code;
    throw e;
  }
  return data;
}

/** يستخدم Supabase RPC على GitHub Pages؛ يعود لـ Node API محلياً إن لزم. */
async function authAction(rpcName, rpcArgs, apiPath, apiJson) {
  const sb = getStorefrontSupabase();
  if (sb) {
    return customerRpc(rpcName, rpcArgs);
  }
  return storefrontFetch(apiPath, { method: "POST", json: apiJson });
}

export async function registerCustomer({ phone, name, password }) {
  const data = await authAction(
    "store_customer_register",
    { p_phone: phone, p_name: name, p_password: password },
    "/api/store/auth/register",
    { phone, name, password },
  );
  setCustomerSession(data);
  return data;
}

export async function loginCustomer({ phone, password }) {
  const data = await authAction(
    "store_customer_login",
    { p_phone: phone, p_password: password },
    "/api/store/auth/login",
    { phone, password },
  );
  setCustomerSession(data);
  return data;
}

export async function logoutCustomer() {
  const token = getCustomerToken();
  if (token) {
    try {
      const sb = getStorefrontSupabase();
      if (sb) {
        await customerRpc("store_customer_logout", { p_token: token });
      } else {
        await storefrontFetch("/api/store/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      /* تجاهل — الجلسة تُمسح محلياً */
    }
  }
  clearCustomerSession();
}

export async function fetchCustomerMe() {
  const token = getCustomerToken();
  if (!token) return null;
  try {
    const sb = getStorefrontSupabase();
    let data;
    if (sb) {
      data = await customerRpc("store_customer_me", { p_token: token });
    } else {
      data = await storefrontFetch("/api/store/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    if (data?.customer) {
      setCustomerSession({ token, customer: data.customer, expiresAt: readRaw()?.expiresAt });
    }
    return data?.customer || null;
  } catch (e) {
    if (e?.status === 401 || String(e?.message || "").includes("UNAUTHORIZED")) clearCustomerSession();
    return null;
  }
}

export async function fetchCustomerOrders() {
  const token = getCustomerToken();
  if (!token) throw new Error("يجب تسجيل الدخول");
  const sb = getStorefrontSupabase();
  if (sb) {
    const data = await customerRpc("store_customer_list_orders", { p_token: token });
    return data?.orders || [];
  }
  const data = await storefrontFetch("/api/store/orders", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data?.orders || [];
}

export function accountPageHref() {
  return getCustomerToken() ? "./account-orders.html" : "./account.html";
}
