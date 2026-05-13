import {
  clearAdminSessionAndSupabase,
  isSupabaseAuthConfigured,
  syncAdminTokenFromSupabaseSession,
} from "./supabaseAuth.js";
import { fetchSiteContentSettings, SITE_CONTENT_SETTING_KEYS, upsertSiteContentSettings } from "./adminSupabaseData.js";

/** @type {Record<string, string>} */
let values = {};

const FIELD_META = [
  { section: "الصفحة الرئيسية", fields: [
    { key: "homepage_hero_title", label: "عنوان الهيرو", type: "text" },
    { key: "homepage_hero_subtitle", label: "وصف الهيرو", type: "textarea" },
    { key: "homepage_hero_cta", label: "نص زر «تسوق الآن»", type: "text" },
    { key: "homepage_categories_title", label: "عنوان قسم التصنيفات", type: "text" },
    { key: "homepage_new_arrivals_label", label: "تسمية «وصلنا حديثاً»", type: "text" },
    { key: "homepage_new_arrivals_title", label: "عنوان «وصلنا حديثاً»", type: "text" },
    { key: "footer_tagline", label: "عبارة التذييل", type: "textarea" },
  ]},
  { section: "التواصل", fields: [
    { key: "contact_phone", label: "هاتف ١", type: "tel", dir: "ltr" },
    { key: "contact_phone_2", label: "هاتف ٢ (اختياري)", type: "tel", dir: "ltr" },
    { key: "whatsapp_number", label: "رقم واتساب (للزر العائم)", type: "tel", dir: "ltr", hint: "مثال: 07701234567" },
  ]},
  { section: "وسائل التواصل", fields: [
    { key: "social_instagram", label: "إنستغرام", type: "url", dir: "ltr" },
    { key: "social_facebook", label: "فيسبوك", type: "url", dir: "ltr" },
    { key: "social_tiktok", label: "تيك توك", type: "url", dir: "ltr" },
    { key: "social_telegram", label: "تيليغرام", type: "url", dir: "ltr" },
  ]},
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render() {
  const root = document.getElementById("site-settings-root");
  if (!root) return;

  const sections = FIELD_META.map((sec) => {
    const fields = sec.fields
      .map((f) => {
        const val = escapeHtml(values[f.key] ?? "");
        const dir = f.dir ? ` dir="${f.dir}"` : "";
        const input =
          f.type === "textarea"
            ? `<textarea data-key="${f.key}" rows="3" class="w-full bg-surface-container border border-outline-variant px-3 py-2 focus:border-primary outline-none resize-y"${dir}>${val}</textarea>`
            : `<input data-key="${f.key}" type="${f.type}" value="${val}" class="w-full bg-surface-container border border-outline-variant px-3 py-2 focus:border-primary outline-none"${dir}/>`;
        const hint = f.hint ? `<p class="text-label-sm text-on-surface-variant mt-1">${escapeHtml(f.hint)}</p>` : "";
        return `<div>
          <label class="block text-label-sm text-on-surface-variant mb-1">${escapeHtml(f.label)}</label>
          ${input}
          ${hint}
        </div>`;
      })
      .join("");
    return `<section class="mb-10 border border-outline-variant rounded-lg overflow-hidden bg-surface-container-low">
      <div class="px-6 py-4 border-b border-outline-variant bg-surface-container-high/50">
        <h3 class="text-headline-sm font-headline-sm text-primary">${escapeHtml(sec.section)}</h3>
      </div>
      <div class="px-6 py-5 grid gap-4 md:grid-cols-2">${fields}</div>
    </section>`;
  }).join("");

  root.innerHTML = `
    <p class="text-label-sm text-on-surface-variant mb-6">تعديل النصوص الظاهرة في الصفحة الرئيسية وأرقام التواصل وروابط وسائل التواصل.</p>
    <p id="site-settings-msg" class="hidden text-label-sm mb-4"></p>
    <form id="site-settings-form" class="max-w-4xl">
      ${sections}
      <button type="submit" class="bg-primary text-on-primary font-label-md px-8 py-3 hover:bg-primary-container transition-colors">حفظ الإعدادات</button>
    </form>`;
}

function collectForm() {
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of SITE_CONTENT_SETTING_KEYS) out[k] = "";
  document.querySelectorAll("#site-settings-form [data-key]").forEach((el) => {
    const key = el.getAttribute("data-key");
    if (!key) return;
    out[key] = "value" in el ? String(el.value) : "";
  });
  return out;
}

function showMsg(text, isError = false) {
  const el = document.getElementById("site-settings-msg");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden", "text-error", "text-primary");
  el.classList.add(isError ? "text-error" : "text-primary");
}

async function load() {
  const root = document.getElementById("site-settings-root");
  if (!root) return;
  try {
    values = (await fetchSiteContentSettings()) || {};
    render();
    document.getElementById("site-settings-form")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        values = collectForm();
        await upsertSiteContentSettings(values);
        showMsg("تم حفظ إعدادات الموقع.");
      } catch (e) {
        showMsg(e?.message || "فشل الحفظ", true);
      }
    });
  } catch (e) {
    root.innerHTML = `<p class="text-error text-center py-12">${escapeHtml(e?.message || "فشل التحميل")}</p>`;
  }
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
  await load();
}

init();
