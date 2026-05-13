import { getStorefrontSupabase } from "../lib/supabase/storefrontClient.js";

export const SITE_CONTENT_SETTING_KEYS = [
  "homepage_hero_title",
  "homepage_hero_subtitle",
  "homepage_hero_cta",
  "homepage_categories_title",
  "homepage_new_arrivals_label",
  "homepage_new_arrivals_title",
  "footer_tagline",
  "contact_phone",
  "contact_phone_2",
  "whatsapp_number",
  "social_instagram",
  "social_facebook",
  "social_tiktok",
  "social_telegram",
];

/** @returns {Promise<Record<string, string>>} */
export async function fetchPublicSiteContent() {
  const sb = getStorefrontSupabase();
  if (!sb) return {};
  const { data, error } = await sb.from("store_settings").select("key, value").in("key", SITE_CONTENT_SETTING_KEYS);
  if (error) {
    console.warn("site content", error.message);
    return {};
  }
  /** @type {Record<string, string>} */
  const out = {};
  for (const row of data || []) {
    if (row?.key) out[row.key] = row.value != null ? String(row.value) : "";
  }
  return out;
}

export function waMeUrl(phone, text) {
  let d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = `964${d.slice(1)}`;
  else if (!d.startsWith("964") && d.length >= 9) d = `964${d.replace(/^0+/, "")}`;
  const base = `https://wa.me/${d}`;
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** يطبّق إعدادات المحتوى على عناصر `[data-site-field]` وروابط التواصل. */
export function applySiteContentToDom(settings) {
  if (!settings || typeof settings !== "object") return;

  document.querySelectorAll("[data-site-field]").forEach((el) => {
    const key = el.getAttribute("data-site-field");
    if (!key || settings[key] == null || settings[key] === "") return;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = settings[key];
    } else {
      el.textContent = settings[key];
    }
  });

  const wa = settings.whatsapp_number?.trim();
  const waBtn = document.getElementById("home-whatsapp-btn");
  if (waBtn instanceof HTMLAnchorElement && wa) {
    waBtn.href = waMeUrl(wa, "مرحباً، أود الاستفسار عن منتجاتكم.");
    waBtn.classList.remove("hidden");
  } else if (waBtn instanceof HTMLAnchorElement) {
    waBtn.classList.add("hidden");
  }

  const phone1 = settings.contact_phone?.trim();
  const phone2 = settings.contact_phone_2?.trim();
  const phoneEl = document.getElementById("home-contact-phones");
  if (phoneEl) {
    const parts = [phone1, phone2].filter(Boolean);
    phoneEl.textContent = parts.length ? parts.join(" · ") : "";
    phoneEl.classList.toggle("hidden", !parts.length);
  }

  const socialMap = [
    ["social_instagram", "home-social-instagram"],
    ["social_facebook", "home-social-facebook"],
    ["social_tiktok", "home-social-tiktok"],
    ["social_telegram", "home-social-telegram"],
  ];
  for (const [key, id] of socialMap) {
    const url = settings[key]?.trim();
    const link = document.getElementById(id);
    if (!(link instanceof HTMLAnchorElement)) continue;
    if (url) {
      link.href = url;
      link.classList.remove("hidden");
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    } else {
      link.classList.add("hidden");
    }
  }
}
