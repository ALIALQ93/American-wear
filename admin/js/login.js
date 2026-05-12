import { hasAdminToken, setAdminToken } from "./session.js";
import { isSupabaseAuthConfigured, getSupabaseBrowser, syncAdminTokenFromSupabaseSession } from "./supabaseAuth.js";

function normalizeEmail(value) {
  return String(value).trim().toLowerCase();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (isSupabaseAuthConfigured()) {
    await syncAdminTokenFromSupabaseSession();
  }
  if (hasAdminToken()) {
    window.location.replace("./index.html");
    return;
  }

  const form = document.getElementById("admin-login-form");
  const errorEl = document.getElementById("login-error");

  if (!isSupabaseAuthConfigured()) {
    if (errorEl) {
      errorEl.textContent =
        "أكمل في ملف .env عنوان المشروع ومفتاحاً عاماً: VITE_SUPABASE_URL مع VITE_SUPABASE_PUBLISHABLE_KEY أو VITE_SUPABASE_ANON_KEY (أو نفس الأسماء ببادئة NEXT_PUBLIC_)، وأعد تشغيل npm run dev. للتحقق من الطلبات على الخادم اضبط أيضاً SUPABASE_URL و SUPABASE_ANON_KEY (أو انسخ نفس القيم من VITE_*). تسجيل الدخول عبر Supabase Authentication فقط.";
      errorEl.classList.remove("hidden");
    }
    form?.querySelectorAll("input, button").forEach((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) el.disabled = true;
    });
    return;
  }

  let submitInFlight = false;
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitInFlight) return;
    submitInFlight = true;
    if (errorEl) {
      errorEl.classList.add("hidden");
      errorEl.textContent = "";
    }

    const email = normalizeEmail(document.getElementById("email")?.value ?? "");
    const password = String(document.getElementById("password")?.value ?? "");

    try {
      const sb = getSupabaseBrowser();
      if (!sb) throw new Error("إعدادات Supabase غير مكتملة");
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message || "فشل تسجيل الدخول");
      const token = data.session?.access_token;
      if (!token) throw new Error("لم يُرجع Supabase رمز الجلسة");
      setAdminToken(token);
      window.location.replace("./index.html");
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err instanceof Error ? err.message : "خطأ في الاتصال بالخادم";
        errorEl.classList.remove("hidden");
      }
    } finally {
      submitInFlight = false;
    }
  });
});
