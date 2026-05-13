import { storefrontFetch } from "./storefrontApi.js";

const STORAGE_KEY = "aw-store-customer";

/** @typedef {{ id: number, phone: string, nameAr: string }} StoreCustomer */

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

export async function registerCustomer({ phone, name, password }) {
  const data = await storefrontFetch("/api/store/auth/register", {
    method: "POST",
    json: { phone, name, password },
  });
  setCustomerSession(data);
  return data;
}

export async function loginCustomer({ phone, password }) {
  const data = await storefrontFetch("/api/store/auth/login", {
    method: "POST",
    json: { phone, password },
  });
  setCustomerSession(data);
  return data;
}

export async function logoutCustomer() {
  const token = getCustomerToken();
  if (token) {
    try {
      await storefrontFetch("/api/store/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
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
    const data = await storefrontFetch("/api/store/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (data?.customer) {
      setCustomerSession({ token, customer: data.customer, expiresAt: readRaw()?.expiresAt });
    }
    return data?.customer || null;
  } catch (e) {
    if (e?.status === 401) clearCustomerSession();
    return null;
  }
}

export async function fetchCustomerOrders() {
  const token = getCustomerToken();
  if (!token) throw new Error("يجب تسجيل الدخول");
  const data = await storefrontFetch("/api/store/orders", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data?.orders || [];
}

export function accountPageHref() {
  return getCustomerToken() ? "./account-orders.html" : "./account.html";
}
