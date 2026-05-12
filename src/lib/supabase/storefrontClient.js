/**
 * عميل Supabase للواجهة العامة (قراءة فقط، بدون جلسة) — لا يتعارض مع جلسة الإدارة.
 */
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrlFromEnv, getSupabaseBrowserKeyFromEnv } from "./client.js";

/** @type {import("@supabase/supabase-js").SupabaseClient | null} */
let cached = null;

export function getStorefrontSupabase() {
  if (cached) return cached;
  const url = getSupabaseUrlFromEnv();
  const key = getSupabaseBrowserKeyFromEnv();
  if (!url || !key) return null;
  cached = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cached;
}
