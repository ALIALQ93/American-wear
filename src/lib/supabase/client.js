/**
 * عميل Supabase للمتصفح (Vite).
 * يعادل NEXT_PUBLIC_* في قوالب Next.js — استخدم VITE_* أو NEXT_PUBLIC_* (انظر vite.config.js).
 * لا نستخدم @supabase/ssr هنا لأن المشروع ليس Next.js؛ التحديث يتم عبر onAuthStateChange في supabaseAuth.js.
 */
import { createClient } from "@supabase/supabase-js";

export function getSupabaseUrlFromEnv() {
  return String(
    import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || "",
  ).trim();
}

export function getSupabasePublishableKeyFromEnv() {
  return String(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      "",
  ).trim();
}

/** مفتاح anon التقليدي (JWT) — يعمل في المتصفح مثل publishable عند عدم توفر الأخير */
export function getSupabaseAnonKeyFromEnv() {
  return String(
    import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  ).trim();
}

/** المفتاح العام للمتصفح: publishable ثم anon (أيهما مُعرّف في `.env`) */
export function getSupabaseBrowserKeyFromEnv() {
  const pub = getSupabasePublishableKeyFromEnv();
  if (pub) return pub;
  return getSupabaseAnonKeyFromEnv();
}

/** @param {string} url @param {string} apiKey مفتاح publishable أو anon من لوحة Supabase */
export function createSupabaseBrowserClient(url, apiKey) {
  return createClient(url, apiKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
    },
  });
}
