import { getAdminToken } from "./session.js";
import {
  isSupabaseAuthConfigured,
  syncAdminTokenFromSupabaseSession,
  clearAdminSessionAndSupabase,
} from "./supabaseAuth.js";
import { fetchOrdersList, fetchOrdersStats } from "./adminSupabaseData.js";

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

let ordersCache = [];
let searchQuery = "";

function setText(id, value) {
  const n = document.getElementById(id);
  if (n) n.textContent = value;
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
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-on-surface-variant">لا توجد طلبات مطابقة للبحث أو القائمة فارغة</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map(
      (o) => `
    <tr class="hover:bg-surface-container-highest/50 transition-colors">
      <td class="px-6 py-4 font-label-md text-on-surface">${escapeHtml(o.orderRef || "")}</td>
      <td class="px-6 py-4">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs shrink-0">${escapeHtml(o.initials || "?")}</div>
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
    </tr>`,
    )
    .join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  if (isSupabaseAuthConfigured()) {
    await syncAdminTokenFromSupabaseSession();
  }

  document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
  });

  const token = getAdminToken();
  if (!token) return;

  document.getElementById("order-search")?.addEventListener("input", (e) => {
    searchQuery = e.target.value || "";
    renderTable();
  });

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
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-error">تعذر تحميل الطلبات من Supabase. نفّذ npm run db:push إن لم تطبّق هجرة RLS بعد.</td></tr>`;
    }
  }
});
