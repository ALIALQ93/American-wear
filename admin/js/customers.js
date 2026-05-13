import {
  clearAdminSessionAndSupabase,
  isSupabaseAuthConfigured,
  syncAdminTokenFromSupabaseSession,
} from "./supabaseAuth.js";
import { fetchStoreCustomers, updateStoreCustomerActive } from "./adminSupabaseData.js";
import { authFetch } from "./authFetch.js";

/** @typedef {{ id: number, phone: string, nameAr: string, passwordPlain: string, isActive: boolean, createdAt?: string }} CustomerRow */

/** @type {CustomerRow[]} */
let rows = [];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function waMeUrl(phone, text) {
  let d = String(phone || "").replace(/\D/g, "");
  if (!d) return "#";
  if (d.startsWith("0")) d = `964${d.slice(1)}`;
  else if (!d.startsWith("964") && d.length >= 9) d = `964${d.replace(/^0+/, "")}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(text || "")}`;
}

function passwordWhatsAppMessage(row) {
  const pass = row.passwordPlain || "—";
  return `مرحباً ${row.nameAr || ""}،\nكلمة مرور حسابك في American wear:\n${pass}\n\nيمكنك تسجيل الدخول برقم هاتفك وكلمة المرور أعلاه.`;
}

function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function render() {
  const root = document.getElementById("customers-root");
  if (!root) return;

  const table =
    rows.length === 0
      ? `<p class="text-on-surface-variant text-center py-12">لا يوجد زبائن مسجّلون بعد.</p>`
      : `<div class="overflow-x-auto border border-outline-variant rounded-lg">
        <table class="w-full text-right min-w-[880px]">
          <thead>
            <tr class="text-label-md text-primary border-b border-outline-variant bg-surface-container-high/40">
              <th class="px-4 py-3">الاسم</th>
              <th class="px-4 py-3">الهاتف</th>
              <th class="px-4 py-3">كلمة المرور</th>
              <th class="px-4 py-3">الحالة</th>
              <th class="px-4 py-3">التسجيل</th>
              <th class="px-4 py-3">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((r) => {
                const pass = r.passwordPlain
                  ? escapeHtml(r.passwordPlain)
                  : `<span class="text-on-surface-variant">غير محفوظة</span>`;
                const status = r.isActive
                  ? `<span class="text-primary">نشط</span>`
                  : `<span class="text-error">معطّل</span>`;
                const waDisabled = !r.passwordPlain ? "opacity-40 pointer-events-none" : "";
                return `<tr class="border-b border-outline-variant/60 hover:bg-surface-container-high/30" data-id="${r.id}">
                  <td class="px-4 py-3 font-label-md">${escapeHtml(r.nameAr)}</td>
                  <td class="px-4 py-3 font-mono text-sm" dir="ltr">${escapeHtml(r.phone)}</td>
                  <td class="px-4 py-3">
                    <code class="bg-surface-container px-2 py-1 rounded text-sm" dir="ltr">${pass}</code>
                    ${r.passwordPlain ? `<button type="button" class="copy-pass text-label-sm text-primary mr-2 hover:underline" data-pass="${escapeHtml(r.passwordPlain)}">نسخ</button>` : ""}
                  </td>
                  <td class="px-4 py-3">${status}</td>
                  <td class="px-4 py-3 text-label-sm text-on-surface-variant">${formatDate(r.createdAt)}</td>
                  <td class="px-4 py-3">
                    <div class="flex flex-wrap gap-2">
                      <a class="text-label-sm bg-[#25D366]/20 text-[#25D366] px-3 py-1.5 rounded ${waDisabled}" href="${waMeUrl(r.phone, passwordWhatsAppMessage(r))}" target="_blank" rel="noopener noreferrer">واتساب</a>
                      <button type="button" class="reset-pass text-label-sm text-primary border border-primary/40 px-3 py-1.5 rounded">إعادة تعيين</button>
                      <button type="button" class="toggle-active text-label-sm text-on-surface-variant border border-outline-variant px-3 py-1.5 rounded">${r.isActive ? "تعطيل" : "تفعيل"}</button>
                    </div>
                  </td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>`;

  root.innerHTML = `
    <p class="text-label-sm text-on-surface-variant mb-6">عرض حسابات الزبائن المسجّلة في المتجر. أرسل كلمة المرور عبر واتساب عند نسيانها — لا يوجد إرسال SMS.</p>
    <p id="customers-msg" class="hidden text-label-sm mb-4"></p>
    ${table}`;
}

async function load() {
  const root = document.getElementById("customers-root");
  if (!root) return;
  try {
    rows = (await fetchStoreCustomers()) || [];
    render();
  } catch (e) {
    root.innerHTML = `<p class="text-error text-center py-12">${escapeHtml(e?.message || "فشل التحميل")}</p>`;
  }
}

function showMsg(text, isError = false) {
  const el = document.getElementById("customers-msg");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden", "text-error", "text-primary");
  el.classList.add(isError ? "text-error" : "text-primary");
}

async function resetPassword(id) {
  const pass = randomPassword();
  if (!window.confirm(`إعادة تعيين كلمة المرور إلى: ${pass}\n\nسيتم تحديث الحساب فوراً.`)) return;
  const res = await authFetch(`/api/admin/store-customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ password: pass }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    showMsg(data.error || "فشل إعادة التعيين — تأكد من تشغيل خادم API.", true);
    return;
  }
  const idx = rows.findIndex((r) => r.id === id);
  if (idx >= 0 && data.customer) {
    rows[idx] = {
      ...rows[idx],
      passwordPlain: data.customer.passwordPlain ?? pass,
      isActive: data.customer.isActive ?? rows[idx].isActive,
    };
  }
  render();
  showMsg("تم تحديث كلمة المرور. أرسلها للزبون عبر واتساب.");
}

async function toggleActive(id) {
  const row = rows.find((r) => r.id === id);
  if (!row) return;
  const next = !row.isActive;
  if (!window.confirm(next ? "تفعيل هذا الحساب؟" : "تعطيل هذا الحساب؟ لن يتمكن من تسجيل الدخول.")) return;
  await updateStoreCustomerActive(id, next);
  row.isActive = next;
  render();
  showMsg(next ? "تم تفعيل الحساب." : "تم تعطيل الحساب.");
}

function wireTable() {
  document.getElementById("customers-root")?.addEventListener("click", async (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const tr = t.closest("tr[data-id]");
    if (!tr) return;
    const id = Number(tr.getAttribute("data-id"));
    if (!Number.isFinite(id)) return;

    if (t.classList.contains("copy-pass")) {
      const pass = t.getAttribute("data-pass") || "";
      try {
        await navigator.clipboard.writeText(pass);
        showMsg("تم نسخ كلمة المرور.");
      } catch {
        showMsg("تعذر النسخ من المتصفح.", true);
      }
      return;
    }
    if (t.classList.contains("reset-pass")) {
      try {
        await resetPassword(id);
      } catch (e) {
        showMsg(e?.message || "خطأ", true);
      }
      return;
    }
    if (t.classList.contains("toggle-active")) {
      try {
        await toggleActive(id);
      } catch (e) {
        showMsg(e?.message || "خطأ", true);
      }
    }
  });
}

async function init() {
  if (!isSupabaseAuthConfigured()) {
    window.location.href = "./login.html";
    return;
  }
  await syncAdminTokenFromSupabaseSession();
  document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
  });
  wireTable();
  await load();
}

init();
