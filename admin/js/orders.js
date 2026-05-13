import { getAdminToken } from "./session.js";
import {
  isSupabaseAuthConfigured,
  syncAdminTokenFromSupabaseSession,
  clearAdminSessionAndSupabase,
} from "./supabaseAuth.js";
import { fetchOrderDetail, fetchOrdersList, fetchOrdersStats, updateOrderStatus } from "./adminSupabaseData.js";

const STATUS_LABEL_AR = {
  pending: "قيد المراجعة",
  processing: "قيد التجهيز",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغى",
};

let ordersCache = [];
let searchQuery = "";
/** @type {Awaited<ReturnType<typeof fetchOrderDetail>> | null} */
let activeOrder = null;

function formatNumber(n) {
  return new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(Number(n) || 0);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusBadgeClass(status) {
  if (status === "cancelled") return "px-3 py-1 bg-error-container text-error border border-error/30 text-label-sm rounded";
  if (status === "delivered") return "px-3 py-1 bg-primary/10 text-primary border border-primary/30 text-label-sm rounded";
  if (status === "shipped") return "px-3 py-1 bg-surface-container-highest text-on-surface border border-outline-variant text-label-sm rounded";
  return "px-3 py-1 bg-surface-container-highest text-on-surface-variant text-label-sm rounded";
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("ar-IQ", { dateStyle: "short", timeStyle: "short" }).format(d);
  } catch {
    return "—";
  }
}

function waMeUrl(phone, text) {
  let d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = `964${d.slice(1)}`;
  else if (!d.startsWith("964") && d.length >= 9) d = `964${d.replace(/^0+/, "")}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(text || "")}`;
}

function setText(id, value) {
  const n = document.getElementById(id);
  if (n) n.textContent = value;
}

function showModalMsg(text, isError = false) {
  const el = document.getElementById("order-modal-msg");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden", "text-error", "text-primary");
  el.classList.add(isError ? "text-error" : "text-primary");
}

function renderStats(by) {
  const b = by || {};
  setText("ord-stat-pending", formatNumber(b.pending ?? 0));
  setText("ord-stat-processing", formatNumber(b.processing ?? 0));
  setText("ord-stat-shipped", formatNumber(b.shipped ?? 0));
  setText("ord-stat-delivered", formatNumber(b.delivered ?? 0));
  setText("ord-stat-cancelled", formatNumber(b.cancelled ?? 0));
}

function filterOrders() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return ordersCache;
  return ordersCache.filter((o) => {
    const blob = [o.orderRef, o.customerName, o.customerCity, o.summary, o.statusLabelAr, o.status]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return blob.includes(q);
  });
}

function renderTable() {
  const tbody = document.getElementById("orders-tbody");
  const label = document.getElementById("orders-count-label");
  if (!tbody) return;
  const rows = filterOrders();
  if (label) label.textContent = `${formatNumber(rows.length)} طلباً`;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-on-surface-variant">لا توجد طلبات مطابقة للبحث أو القائمة فارغة</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (o) => `
    <tr class="hover:bg-surface-container-highest/50 transition-colors">
      <td class="px-6 py-4 font-label-md text-on-surface font-mono dir-ltr">${escapeHtml(o.orderRef || "")}</td>
      <td class="px-6 py-4">
        <motion.div class="flex items-center gap-3">
          <motion.div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs shrink-0">${escapeHtml(o.initials || "?")}</div>
          <div>
            <p class="text-on-surface font-body-md">${escapeHtml(o.customerName || "")}</p>
            <p class="text-label-sm text-on-surface-variant">${escapeHtml(o.customerCity || "—")}</p>
          </div>
        </div>
      </td>
      <td class="px-6 py-4 text-on-surface-variant text-sm max-w-xs truncate">${escapeHtml(o.summary || "—")}</td>
      <td class="px-6 py-4 text-left font-body-md text-primary font-semibold">${formatNumber(o.totalIqd)} IQD</td>
      <td class="px-6 py-4"><span class="${statusBadgeClass(o.status)}">${escapeHtml(o.statusLabelAr || o.status || "")}</span></td>
      <td class="px-6 py-4 text-on-surface-variant text-label-sm">${formatDate(o.createdAt)}</td>
      <td class="px-6 py-4">
        <button type="button" class="order-open-btn text-label-sm text-primary border border-primary/40 px-3 py-1.5 rounded hover:bg-primary/10" data-id="${o.id}">تفاصيل / وصل</button>
      </td>
    </tr>`,
    )
    .join("")
    .replace(/<\/?motion\.div>/g, (tag) => tag.replace("motion.", ""));
}

function receiptHtml(order) {
  const itemsRows = (order.items || [])
    .map(
      (it) => `<tr>
        <td style="padding:8px;border-bottom:1px solid #ddd">${escapeHtml(it.productName)}${it.variantLabel ? ` (${escapeHtml(it.variantLabel)})` : ""}</td>
        <td style="padding:8px;border-bottom:1px solid #ddd;text-align:center">${formatNumber(it.qty)}</td>
        <td style="padding:8px;border-bottom:1px solid #ddd;text-align:left">${formatNumber(it.unitPriceIqd)}</td>
        <td style="padding:8px;border-bottom:1px solid #ddd;text-align:left">${formatNumber(it.lineTotalIqd)}</td>
      </tr>`,
    )
    .join("");

  return `
    <div style="max-width:720px;margin:0 auto;font-family:system-ui,sans-serif;color:#111">
      <motion.div style="text-align:center;margin-bottom:24px;border-bottom:2px solid #b8860b;padding-bottom:16px">
        <h1 style="font-size:1.5rem;margin:0;color:#8b6914">American wear</h1>
        <p style="margin:8px 0 0;color:#555">وصل طلب</p>
      </div>
      <p><strong>رقم الطلب:</strong> <span dir="ltr">${escapeHtml(order.orderRef)}</span></p>
      <p><strong>التاريخ:</strong> ${escapeHtml(formatDate(order.createdAt))}</p>
      <p><strong>الحالة:</strong> ${escapeHtml(order.statusLabelAr || STATUS_LABEL_AR[order.status] || order.status)}</p>
      <hr style="margin:16px 0;border:none;border-top:1px solid #ddd"/>
      <p><strong>الزبون:</strong> ${escapeHtml(order.customerName)}</p>
      <p><strong>الهاتف:</strong> <span dir="ltr">${escapeHtml(order.customerPhone || "—")}</span></p>
      <p><strong>المحافظة:</strong> ${escapeHtml(order.governorateName || order.customerCity || "—")}</p>
      <p><strong>العنوان:</strong> ${escapeHtml(order.customerAddress || "—")}</p>
      <p><strong>طريقة الدفع:</strong> ${escapeHtml(order.paymentMethodName || "—")}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:14px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px;text-align:right">المنتج</th>
            <th style="padding:8px">الكمية</th>
            <th style="padding:8px;text-align:left">السعر</th>
            <th style="padding:8px;text-align:left">الإجمالي</th>
          </tr>
        </thead>
        <tbody>${itemsRows || `<tr><td colspan="4" style="padding:12px;text-align:center;color:#666">لا توجد بنود</td></tr>`}</tbody>
      </table>
      <div style="margin-top:20px;text-align:left;direction:ltr">
        <p>المجموع الفرعي: ${formatNumber(order.subtotalIqd)} IQD</p>
        <p>الشحن: ${formatNumber(order.shippingFeeIqd)} IQD</p>
        <p style="font-size:1.15rem;font-weight:bold;color:#8b6914">الإجمالي: ${formatNumber(order.totalIqd)} IQD</p>
      </div>
      ${order.summary ? `<pre style="margin-top:16px;white-space:pre-wrap;font-family:inherit;color:#444;background:#fafafa;padding:12px;border-radius:4px">${escapeHtml(order.summary)}</pre>` : ""}
      <p style="margin-top:24px;text-align:center;font-size:12px;color:#888">شكراً لتسوقكم معنا — American wear</p>
    </div>`.replace(/<\/?motion\.div>/g, (tag) => tag.replace("motion.", ""));
}

function modalBodyHtml(order) {
  const items =
    order.items?.length > 0
      ? order.items
          .map(
            (it) => `<tr class="border-b border-outline-variant/50">
            <td class="py-2 pr-2">${escapeHtml(it.productName)}${it.variantLabel ? ` <span class="text-on-surface-variant text-sm">(${escapeHtml(it.variantLabel)})</span>` : ""}</td>
            <td class="py-2 text-center">${formatNumber(it.qty)}</td>
            <td class="py-2 text-left font-mono">${formatNumber(it.unitPriceIqd)}</td>
            <td class="py-2 text-left font-mono text-primary">${formatNumber(it.lineTotalIqd)}</td>
          </tr>`,
          )
          .join("")
      : `<tr><td colspan="4" class="py-6 text-center text-on-surface-variant">لا توجد بنود مسجّلة</td></tr>`;

  return `
    <div class="grid md:grid-cols-2 gap-4 text-label-sm">
      <div class="border border-outline-variant rounded-lg p-4 bg-surface-container/30">
        <p class="text-on-surface-variant mb-1">رقم الطلب</p>
        <p class="font-mono text-primary dir-ltr text-label-md">${escapeHtml(order.orderRef)}</p>
        <p class="text-on-surface-variant mt-3 mb-1">التاريخ</p>
        <p>${escapeHtml(formatDate(order.createdAt))}</p>
      </div>
      <div class="border border-outline-variant rounded-lg p-4 bg-surface-container/30">
        <p class="text-on-surface-variant mb-1">الزبون</p>
        <p class="text-label-md">${escapeHtml(order.customerName)}</p>
        <p class="dir-ltr font-mono mt-2">${escapeHtml(order.customerPhone || "—")}</p>
        <p class="text-on-surface-variant mt-3 mb-1">العنوان</p>
        <p>${escapeHtml(order.customerAddress || "—")}</p>
        <p class="text-on-surface-variant">${escapeHtml(order.governorateName || order.customerCity || "")}</p>
      </div>
    </div>
    <div>
      <p class="text-label-md text-primary mb-2">البنود</p>
      <div class="overflow-x-auto border border-outline-variant rounded-lg">
        <table class="w-full text-right min-w-[480px] text-label-sm">
          <thead><tr class="bg-surface-container-high text-primary">
            <th class="px-3 py-2">المنتج</th><th class="px-3 py-2">كمية</th>
            <th class="px-3 py-2 text-left">سعر</th><th class="px-3 py-2 text-left">إجمالي</th>
          </tr></thead>
          <tbody>${items}</tbody>
        </table>
      </div>
    </div>
    <div class="flex flex-wrap justify-between gap-4 border-t border-outline-variant pt-4">
      <div class="text-on-surface-variant text-label-sm">
        <p>طريقة الدفع: <span class="text-on-surface">${escapeHtml(order.paymentMethodName || "—")}</span></p>
      </div>
      <div class="text-left">
        <p class="text-label-sm text-on-surface-variant">المجموع: ${formatNumber(order.subtotalIqd)} IQD</p>
        <p class="text-label-sm text-on-surface-variant">الشحن: ${formatNumber(order.shippingFeeIqd)} IQD</p>
        <p class="text-label-md text-primary font-semibold">الإجمالي: ${formatNumber(order.totalIqd)} IQD</p>
      </div>
    </div>`;
}

function renderReceipt(order) {
  const el = document.getElementById("order-receipt-print");
  if (el) el.innerHTML = receiptHtml(order);
}

function renderModal(order) {
  activeOrder = order;
  const title = document.getElementById("order-modal-title");
  const body = document.getElementById("order-modal-body");
  const sel = document.getElementById("order-status-select");
  const waBtn = document.getElementById("order-wa-btn");

  if (title) title.textContent = `طلب ${order.orderRef}`;
  if (body) body.innerHTML = modalBodyHtml(order);
  if (sel instanceof HTMLSelectElement) sel.value = order.status || "pending";

  renderReceipt(order);

  const msg = `مرحباً ${order.customerName}،\nوصل طلبكم رقم ${order.orderRef}\nالحالة: ${order.statusLabelAr || STATUS_LABEL_AR[order.status]}\nالإجمالي: ${formatNumber(order.totalIqd)} د.ع\n\nشكراً لتسوقكم مع American wear`;
  if (waBtn instanceof HTMLButtonElement) {
    if (order.customerPhone) {
      waBtn.onclick = () => window.open(waMeUrl(order.customerPhone, msg), "_blank", "noopener");
      waBtn.classList.remove("hidden");
    } else {
      waBtn.classList.add("hidden");
    }
  }

  document.getElementById("order-modal")?.classList.remove("hidden");
  document.getElementById("order-modal-msg")?.classList.add("hidden");
}

function closeModal() {
  document.getElementById("order-modal")?.classList.add("hidden");
  activeOrder = null;
}

async function openOrder(id) {
  const body = document.getElementById("order-modal-body");
  document.getElementById("order-modal")?.classList.remove("hidden");
  if (body) body.innerHTML = `<p class="text-on-surface-variant text-center py-8">جاري التحميل…</p>`;
  try {
    const order = await fetchOrderDetail(id);
    if (order) renderModal(order);
  } catch (e) {
    if (body) body.innerHTML = `<p class="text-error text-center py-8">${escapeHtml(e?.message || "فشل التحميل")}</p>`;
  }
}

async function saveStatus() {
  if (!activeOrder) return;
  const sel = document.getElementById("order-status-select");
  if (!(sel instanceof HTMLSelectElement)) return;
  const next = sel.value;
  if (next === activeOrder.status) {
    showModalMsg("لم تتغير الحالة.");
    return;
  }
  try {
    const updated = await updateOrderStatus(activeOrder.id, next);
    activeOrder.status = updated.status;
    activeOrder.statusLabelAr = updated.statusLabelAr;
    const row = ordersCache.find((o) => o.id === activeOrder.id);
    if (row) {
      row.status = updated.status;
      row.statusLabelAr = updated.statusLabelAr;
    }
    renderTable();
    renderModal(activeOrder);
    const stats = await fetchOrdersStats();
    if (stats) renderStats(stats);
    showModalMsg("تم تحديث حالة الطلب.");
  } catch (e) {
    showModalMsg(e?.message || "فشل الحفظ", true);
  }
}

function printReceipt() {
  if (!activeOrder) return;
  const printEl = document.getElementById("order-receipt-print");
  if (!printEl) return;
  printEl.classList.remove("hidden");
  window.print();
  printEl.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", async () => {
  if (isSupabaseAuthConfigured()) {
    await syncAdminTokenFromSupabaseSession();
  }

  document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
  });

  if (!getAdminToken()) return;

  document.getElementById("order-search")?.addEventListener("input", (e) => {
    searchQuery = e.target.value || "";
    renderTable();
  });

  document.getElementById("orders-tbody")?.addEventListener("click", (ev) => {
    const btn = ev.target instanceof HTMLElement ? ev.target.closest(".order-open-btn") : null;
    if (!btn) return;
    const id = Number(btn.getAttribute("data-id"));
    if (Number.isFinite(id)) openOrder(id);
  });

  document.getElementById("order-modal-close")?.addEventListener("click", closeModal);
  document.getElementById("order-modal-backdrop")?.addEventListener("click", closeModal);
  document.getElementById("order-save-status-btn")?.addEventListener("click", saveStatus);
  document.getElementById("order-print-btn")?.addEventListener("click", printReceipt);

  try {
    const [stats, list] = await Promise.all([fetchOrdersStats(), fetchOrdersList()]);
    if (stats) renderStats(stats);
    if (list) {
      ordersCache = list;
      renderTable();
    }
  } catch (e) {
    console.error(e);
    const tbody = document.getElementById("orders-tbody");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-error">تعذر تحميل الطلبات من Supabase.</td></tr>`;
    }
  }
});
