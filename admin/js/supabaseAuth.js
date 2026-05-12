import {
  createSupabaseBrowserClient,
  getSupabaseBrowserKeyFromEnv,
  getSupabaseUrlFromEnv,
} from "../../src/lib/supabase/client.js";
import { clearAdminSession, setAdminToken } from "./session.js";

let browserClient = null;

export function isSupabaseAuthConfigured() {
  return Boolean(getSupabaseUrlFromEnv() && getSupabaseBrowserKeyFromEnv());
}

/**
 * عميل Supabase للمتصفح — جلسة في sessionStorage مع تحديث تلقائي للرمز.
 * يحدّث `aw_admin_jwt` عند REFRESH / SIGNED_IN حتى تبقى طلبات `/api/admin/*` صالحة.
 */
export function getSupabaseBrowser() {
  if (!isSupabaseAuthConfigured()) return null;
  if (!browserClient) {
    const url = getSupabaseUrlFromEnv();
    const key = getSupabaseBrowserKeyFromEnv();
    browserClient = createSupabaseBrowserClient(url, key);
    browserClient.auth.onAuthStateChange((event, session) => {
      if (session?.access_token) {
        setAdminToken(session.access_token);
        return;
      }
      if (event === "SIGNED_OUT") {
        clearAdminSession();
      }
    });
  }
  return browserClient;
}

/**
 * يزيل رمز الإدارة وجلسة Supabase في المتصفح معاً.
 * بدون signOut تبقى جلسة Supabase في التخزين فيُعاد نسخ الرمز في صفحة login (حلقة تحديث سريعة مع 401).
 */
export async function clearAdminSessionAndSupabase() {
  if (isSupabaseAuthConfigured()) {
    const sb = getSupabaseBrowser();
    try {
      await sb?.auth.signOut();
    } catch {
      /* ignore */
    }
  }
  clearAdminSession();
}

/** مزامنة الرمز المحفوظ يدوياً مع جلسة Supabase بعد تحديث/تحميل الصفحة */
export async function syncAdminTokenFromSupabaseSession() {
  if (!isSupabaseAuthConfigured()) return;
  const sb = getSupabaseBrowser();
  if (!sb) return;
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (session?.access_token) setAdminToken(session.access_token);
}
