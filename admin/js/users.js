import { authFetch } from "./authFetch.js";
import { getAdminToken } from "./session.js";
import {
  isSupabaseAuthConfigured,
  syncAdminTokenFromSupabaseSession,
  clearAdminSessionAndSupabase,
} from "./supabaseAuth.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @type {{ userId: string, email: string, role: string, isActive: boolean }[]} */
let rows = [];
let myRole = "";

function render() {
  const root = document.getElementById("users-root");
  if (!root) return;

  if (myRole !== "super_admin") {
    root.innerHTML = `<div class="max-w-xl mx-auto rounded-lg border border-outline-variant bg-surface-container-low p-8 text-center">
      <p class="text-on-surface font-body-md mb-2">صلاحية «مسؤول أعلى» مطلوبة</p>
      <p class="text-on-surface-variant text-sm leading-relaxed">إدارة المسؤولين متاحة فقط لحساب بصلاحية <strong class="text-primary">super_admin</strong> في جدول <code class="text-primary" dir="ltr">admin_profiles</code>. يجب أن يبقى في النظام مسؤول أعلى نشط واحد على الأقل.</p>
      <p class="text-on-surface-variant text-sm mt-4">يمكنك مؤقتاً الدخول كمسؤول عبر <span dir="ltr">ADMIN_ALLOWED_EMAILS</span> (دور admin) حتى يُنشأ لك صف <strong>super_admin</strong> من SQL أو من مسؤول أعلى آخر.</p>
    </div>`;
    return;
  }

  const hasActiveSuper = rows.some((r) => r.role === "super_admin" && r.isActive);
  function isLastActiveSuperAdmin(r) {
    if (r.role !== "super_admin" || !r.isActive) return false;
    return !rows.some((x) => x.userId !== r.userId && x.role === "super_admin" && x.isActive);
  }
  const roleOptionsAdd = hasActiveSuper
    ? `<option value="admin">admin</option><option value="super_admin">super_admin</option>`
    : `<option value="super_admin">super_admin (إلزامي لأول مسؤول)</option>`;

  const addBlock = `
    <section class="mb-8 p-6 border border-outline-variant rounded-lg bg-surface-container-low">
      <h3 class="font-headline-sm text-headline-sm text-on-surface mb-4">ربط مستخدم من Authentication</h3>
      <p class="text-on-surface-variant text-sm mb-4 leading-relaxed">أنشئ المستخدم في Supabase → Authentication → Users، ثم انسخ <strong>User UID</strong> والصقه هنا. ${hasActiveSuper ? "يمكن اختيار دور <strong>admin</strong> أو <strong>super_admin</strong>." : "أول مسؤول يجب أن يكون <strong>super_admin</strong>."}</p>
      <form id="add-admin-form" class="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-end">
        <div>
          <label class="block text-label-sm text-on-surface-variant mb-1" for="new-user-id">User UID</label>
          <input id="new-user-id" name="userId" type="text" dir="ltr" class="w-full bg-surface-container-high border border-outline-variant px-3 py-2 text-sm text-on-surface rounded" placeholder="uuid" required autocomplete="off"/>
        </div>
        <div>
          <label class="block text-label-sm text-on-surface-variant mb-1" for="new-email">البريد (اختياري)</label>
          <input id="new-email" name="email" type="email" dir="ltr" class="w-full bg-surface-container-high border border-outline-variant px-3 py-2 text-sm text-on-surface rounded" placeholder="يُؤخذ من Auth إن تُرك فارغاً"/>
        </div>
        <div>
          <label class="block text-label-sm text-on-surface-variant mb-1" for="new-role">الدور</label>
          <select id="new-role" class="w-full bg-surface-container-high border border-outline-variant px-3 py-2 text-sm text-on-surface rounded">
            ${roleOptionsAdd}
          </select>
        </div>
        <div>
          <button type="submit" class="w-full bg-primary text-on-primary font-label-md py-2 rounded">إضافة</button>
        </div>
      </form>
      <p id="users-form-error" class="hidden mt-3 text-sm text-error text-center" role="alert"></p>
    </section>`;

  if (!rows.length) {
    root.innerHTML =
      addBlock +
      `<p class="text-on-surface-variant text-center py-8">لا يوجد مسؤولون مربوطون في الجدول بعد.</p>`;
    bindForm();
    return;
  }

  root.innerHTML =
    addBlock +
    `<div class="overflow-x-auto border border-outline-variant rounded-lg bg-surface-container-low">
    <table class="w-full text-right min-w-[640px]">
      <thead>
        <tr class="text-label-md text-primary border-b border-outline-variant bg-surface-container-lowest/80">
          <th class="px-4 py-3">البريد</th>
          <th class="px-4 py-3">User UID</th>
          <th class="px-4 py-3">الدور</th>
          <th class="px-4 py-3">نشط</th>
          <th class="px-4 py-3 w-32"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-outline-variant/40">
        ${rows
          .map((r) => {
            const lastSuper = isLastActiveSuperAdmin(r);
            return `
          <tr class="hover:bg-surface-container-highest/40" data-user-id="${escapeHtml(r.userId)}">
            <td class="px-4 py-3 text-on-surface font-body-md">${escapeHtml(r.email)}</td>
            <td class="px-4 py-3 text-on-surface-variant text-xs font-mono" dir="ltr">${escapeHtml(r.userId)}</td>
            <td class="px-4 py-3">
              <select data-field="role" class="bg-surface-container-high border border-outline-variant px-2 py-1 text-sm rounded text-on-surface" ${lastSuper ? "disabled title=\"آخر مسؤول أعلى نشط\"" : ""}>
                <option value="admin" ${r.role === "admin" ? "selected" : ""}>admin</option>
                <option value="super_admin" ${r.role === "super_admin" ? "selected" : ""}>super_admin</option>
              </select>
            </td>
            <td class="px-4 py-3">
              <input type="checkbox" data-field="active" class="h-4 w-4 accent-primary" ${r.isActive ? "checked" : ""} ${lastSuper ? "disabled title=\"آخر مسؤول أعلى نشط\"" : ""} />
            </td>
            <td class="px-4 py-3 flex flex-wrap gap-2">
              <button type="button" data-action="save" class="text-label-sm text-primary hover:underline" ${lastSuper ? "disabled" : ""}>حفظ</button>
              ${lastSuper ? "" : `<button type="button" data-action="delete" class="text-label-sm text-error hover:underline">حذف الربط</button>`}
            </td>
          </tr>`;
          })
          .join("")}
      </tbody>
    </table></div>`;

  bindForm();
  root.querySelectorAll("tbody tr[data-user-id]").forEach((tr) => {
    const id = tr.getAttribute("data-user-id");
    tr.querySelector('[data-action="save"]')?.addEventListener("click", () => saveRow(id, tr));
    tr.querySelector('[data-action="delete"]')?.addEventListener("click", () => deleteRow(id));
  });
}

function bindForm() {
  const form = document.getElementById("add-admin-form");
  const errEl = document.getElementById("users-form-error");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errEl) {
      errEl.textContent = "";
      errEl.classList.add("hidden");
    }
    const userId = document.getElementById("new-user-id")?.value?.trim() || "";
    const email = document.getElementById("new-email")?.value?.trim() || "";
    const role = document.getElementById("new-role")?.value || "admin";
    try {
      const res = await authFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ userId, email: email || undefined, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        await clearAdminSessionAndSupabase();
        window.location.href = "./login.html";
        return;
      }
      if (!res.ok) throw new Error(data.error || "فشل الإضافة");
      const uid = document.getElementById("new-user-id");
      const em = document.getElementById("new-email");
      if (uid) uid.value = "";
      if (em) em.value = "";
      await reload();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err instanceof Error ? err.message : "خطأ";
        errEl.classList.remove("hidden");
      }
    }
  });
}

async function saveRow(userId, tr) {
  const role = tr.querySelector('[data-field="role"]')?.value;
  const isActive = tr.querySelector('[data-field="active"]')?.checked === true;
  const res = await authFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ role, isActive }),
  });
  if (res.status === 401) {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
    return;
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    alert(d.error || "فشل الحفظ");
    return;
  }
  await reload();
}

async function deleteRow(userId) {
  if (!confirm("إزالة الصلاحية من الجدول؟ (لا يحذف المستخدم من Authentication)")) return;
  const res = await authFetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (res.status === 401) {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
    return;
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    alert(d.error || "فشل الحذف");
    return;
  }
  await reload();
}

async function reload() {
  const token = getAdminToken();
  if (!token) return;
  const res = await authFetch("/api/admin/users");
  if (res.status === 401) {
    await clearAdminSessionAndSupabase();
    window.location.href = "./login.html";
    return;
  }
  if (res.status === 503) {
    const data = await res.json().catch(() => ({}));
    const root = document.getElementById("users-root");
    if (root) {
      root.innerHTML = `<p class="text-error text-center py-8 px-4">${escapeHtml(data.error || "الجدول غير جاهز — طبّق الهجرات.")}</p>`;
    }
    return;
  }
  if (res.status === 403) {
    myRole = "";
    rows = [];
    render();
    return;
  }
  if (!res.ok) throw new Error("فشل التحميل");
  rows = await res.json();
  render();
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

  try {
    const sRes = await authFetch("/api/admin/session");
    if (sRes.status === 401) {
      await clearAdminSessionAndSupabase();
      window.location.href = "./login.html";
      return;
    }
    if (!sRes.ok) throw new Error("session");
    const session = await sRes.json();
    myRole = session.role || "";

    if (myRole !== "super_admin") {
      render();
      return;
    }

    await reload();
  } catch (e) {
    console.error(e);
    const root = document.getElementById("users-root");
    if (root) {
      root.innerHTML = `<p class="text-error text-center py-12">تعذر التحميل. تأكد أن الهجرة admin_profiles مطبّقة وأن الخادم يعمل.</p>`;
    }
  }
});
