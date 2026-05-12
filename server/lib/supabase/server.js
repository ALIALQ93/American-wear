/**
 * عميل Supabase على خادم Node — للتحقق من Bearer (مثلاً auth.getUser).
 * يقرأ بالترتيب: SUPABASE_* ثم VITE_* ثم NEXT_PUBLIC_* (نفس أسماء قالب Next في .env).
 * للتحقق من الرموز يُفضّل مفتاح **anon** التقليدي (JWT يبدأ بـ eyJ…) من Settings → API؛
 * مفتاح publishable (sb_publishable_…) قد لا يعمل مع auth.getUser حسب إصدار المشروع.
 * مفتاح Secret (sb_secret_…) في SUPABASE_SECRET_KEY — خادم فقط؛ يُستخدم كاحتياط بعد anon و publishable.
 */
import { createClient } from "@supabase/supabase-js";

let cached = null;

function resolvedProjectUrl() {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ""
  );
}

function resolvedAuthKey() {
  return (
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    ""
  );
}

/** للتشخيص في /api/health — لا يُعاد المفتاح نفسه */
export function resolvedAuthKeyKind() {
  const k = resolvedAuthKey();
  if (!k) return "missing";
  if (k.startsWith("eyJ")) return "jwt";
  if (k.startsWith("sb_publishable_")) return "publishable";
  if (k.startsWith("sb_secret_")) return "secret";
  if (k.startsWith("sb_")) return "sb_other";
  return "unknown";
}

/** للعرض في /api/health — نفس المنطق الذي يبني به العميل */
export function resolvedSupabaseUrlForHealth() {
  const u = resolvedProjectUrl();
  return u || null;
}

export function getSupabaseAuthServerClient() {
  const url = resolvedProjectUrl();
  const key = resolvedAuthKey();
  if (!url || !key) return null;
  if (!cached) {
    cached = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return cached;
}
