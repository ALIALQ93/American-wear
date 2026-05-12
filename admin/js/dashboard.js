import { getAdminToken } from "./session.js";
import { isSupabaseAuthConfigured, syncAdminTokenFromSupabaseSession, clearAdminSessionAndSupabase } from "./supabaseAuth.js";

function formatNumber(n) {
  return new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(Number(n) || 0);
}

function statusBadgeClass(type) {
  switch (type) {
    case "done":
      return "px-3 py-1 bg-primary/10 text-primary border border-primary/30 text-label-sm";
    case "shipping":
      return "px-3 py-1 bg-surface-container-highest text-on-surface-variant border border-outline-variant text-label-sm";
    case "cancelled":
      return "px-3 py-1 bg-error-container text-error border border-error/30 text-label-sm";
    default:
      return "px-3 py-1 bg-surface-container-highest text-on-surface-variant text-label-sm";
  }
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function renderStats(stats) {
  setText("stat-total-orders", formatNumber(stats.totalOrders));
  setText("stat-revenue", formatNumber(stats.revenueIQD));
  setText("stat-products", formatNumber(stats.products));
  setText("stat-customers", formatNumber(stats.newCustomers));
}

function renderOrdersTable(recentOrders) {
  const tbody = document.getElementById("recent-orders-tbody");
  if (!tbody) return;
  if (!recentOrders?.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-8 py-10 text-center text-on-surface-variant">لا توجد طلبات في قاعدة البيانات</td></tr>`;
    return;
  }
  tbody.replaceChildren(
    ...recentOrders.map((row) => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-surface-container-highest transition-colors";
      const label = row.statusLabelAr || row.status || "";
      tr.innerHTML = `
        <td class="px-8 py-5 text-on-surface font-label-md">${escapeHtml(row.orderRef)}</td>
        <td class="px-8 py-5">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs">${escapeHtml(row.initials || "")}</div>
            <span class="text-on-surface font-body-md">${escapeHtml(row.customerName)}</span>
          </div>
        </td>
        <td class="px-8 py-5 text-on-surface">${formatNumber(row.totalIqd)} IQD</td>
        <td class="px-8 py-5">
          <span class="${statusBadgeClass(row.statusType)}">${escapeHtml(label)}</span>
        </td>`;
      return tr;
    }),
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

  const banner = document.getElementById("admin-api-banner");
  const showBanner = (msg) => {
    if (!banner) return;
    banner.textContent = msg;
    banner.classList.remove("hidden");
  };
  const hideBanner = () => {
    if (!banner) return;
    banner.textContent = "";
    banner.classList.add("hidden");
  };

  try {
    const res = await fetch("/api/admin/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      console.warn("[admin] 401", data.code, data.error, data.debug ?? "");
      await clearAdminSessionAndSupabase();
      window.location.href = "./login.html";
      return;
    }
    if (res.status === 403) {
      showBanner(data.error || "ليس لديك صلاحية الدخول إلى لوحة الإدارة.");
      return;
    }
    if (res.status === 503) {
      showBanner(data.error || "اضبط إعدادات الخادم (.env) ثم أعد التشغيل.");
      return;
    }
    if (!res.ok) {
      const msg = [data.detail, data.error].filter(Boolean).join(" — ") || "فشل تحميل لوحة التحكم";
      showBanner(msg);
      throw new Error("dashboard fetch failed");
    }
    hideBanner();
    renderStats(data.stats || {});
    renderOrdersTable(data.recentOrders || []);
  } catch (e) {
    console.error(e);
    const tbody = document.getElementById("recent-orders-tbody");
    if (tbody && !banner?.textContent) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-8 py-10 text-center text-error">تعذر الاتصال بالخادم. تأكد أن سطر [api] يعمل (npm run dev) وأن قيمة PORT في .env تطابق وكيل Vite إن غيّرت المنفذ.</td></tr>`;
    }
  }
});
