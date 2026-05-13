import { escapeHtml } from "./storefrontCommon.js";
import { getStorefrontSupabase } from "../lib/supabase/storefrontClient.js";
import { formatPrice, loadCurrencySettings } from "./currencyStore.js";
import {
  fetchCustomerMe,
  fetchCustomerOrders,
  getCustomer,
  getCustomerToken,
  logoutCustomer,
} from "./customerSession.js";

const statusLabelAr = {
  pending: "قيد المراجعة",
  processing: "قيد التجهيز",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغى",
};

function statusClass(status) {
  const s = String(status || "");
  if (s === "delivered") return "text-green-400";
  if (s === "cancelled") return "text-error";
  if (s === "shipped") return "text-primary";
  return "text-on-surface-variant";
}

function renderOrders(root, customer, orders) {
  const list =
    orders.length > 0
      ? orders
          .map((o) => {
            const st = statusLabelAr[o.status] || o.status;
            const date = o.createdAt ? new Date(o.createdAt).toLocaleDateString("ar-IQ") : "—";
            const summary = o.summary
              ? `<p class="text-label-sm text-on-surface-variant mt-2 whitespace-pre-line line-clamp-3">${escapeHtml(o.summary)}</p>`
              : "";
            return `<article class="luxury-border rounded-lg p-5 bg-surface-container/20">
              <div class="flex flex-wrap justify-between gap-3 items-start">
                <div>
                  <p class="font-mono text-primary dir-ltr text-label-md">${escapeHtml(o.orderRef || "")}</p>
                  <p class="text-label-sm text-on-surface-variant mt-1">${escapeHtml(date)} · ${escapeHtml(o.customerCity || "")}</p>
                </div>
                <div class="text-left">
                  <p class="text-primary font-label-md">${escapeHtml(formatPrice(o.totalIqd))}</p>
                  <p class="text-label-sm mt-1 ${statusClass(o.status)}">${escapeHtml(st)}</p>
                </motion.div>
              </motion.div>
              ${summary}
            </article>`;
          })
          .join("")
      : `<p class="text-on-surface-variant text-body-md text-center py-12">لا توجد طلبات مرتبطة بحسابك بعد. <a class="text-primary underline" href="./home.html">تسوق الآن</a></p>`;

  root.innerHTML = `
    <div class="flex flex-wrap justify-between items-center gap-4 mb-8">
      <div>
        <h1 class="text-headline-md font-headline-md text-primary">طلباتي</h1>
        <p class="text-on-surface-variant text-label-md mt-1">مرحباً، ${escapeHtml(customer.nameAr || "")} <span class="dir-ltr font-mono">${escapeHtml(customer.phone || "")}</span></p>
      </div>
      <button type="button" id="account-logout-btn" class="border border-outline-variant px-4 py-2 text-label-sm hover:border-primary hover:text-primary">تسجيل الخروج</button>
    </div>
    <div class="space-y-4">${list}</div>`;

  document.getElementById("account-logout-btn")?.addEventListener("click", async () => {
    await logoutCustomer();
    window.location.href = "./account.html";
  });
}

async function main() {
  const root = document.getElementById("account-orders-root");
  if (!root) return;

  if (!getCustomerToken()) {
    window.location.href = "./account.html?next=./account-orders.html";
    return;
  }

  root.innerHTML = '<p class="text-on-surface-variant">جاري التحميل…</p>';

  const sb = getStorefrontSupabase();
  if (sb) await loadCurrencySettings(sb);

  let customer = getCustomer();
  customer = (await fetchCustomerMe()) || customer;
  if (!customer) {
    window.location.href = "./account.html?next=./account-orders.html";
    return;
  }

  try {
    const orders = await fetchCustomerOrders();
    renderOrders(root, customer, orders);
  } catch (e) {
    root.innerHTML = `<p class="text-error">${escapeHtml(e instanceof Error ? e.message : "تعذر تحميل الطلبات")}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", main);
