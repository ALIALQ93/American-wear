import { getCustomerToken, loginCustomer, registerCustomer, requestPasswordReset } from "./customerSession.js";
import { STOREFRONT } from "./storefrontPaths.js";
import { isSafeStorefrontPath } from "./storefrontCommon.js";

function postAuthRedirectHref() {
  const raw = new URLSearchParams(location.search).get("next");
  if (raw && isSafeStorefrontPath(raw)) return raw;
  return STOREFRONT.accountOrders;
}

function showCheckoutNotice() {
  const next = new URLSearchParams(location.search).get("next");
  const el = document.getElementById("auth-checkout-notice");
  if (el && next === STOREFRONT.checkout) el.classList.remove("hidden");
}

function showMessage(el, msg, isSuccess = false) {
  if (!el) return;
  if (!msg) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
  if (isSuccess) {
    el.classList.remove("text-error");
    el.classList.add("text-primary");
  }
}

function showError(el, msg) {
  if (!el) return;
  if (!msg) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
}

function wireTabs() {
  const loginPanel = document.getElementById("auth-login-panel");
  const registerPanel = document.getElementById("auth-register-panel");
  const forgotPanel = document.getElementById("auth-forgot-panel");
  const tabLogin = document.getElementById("auth-tab-login");
  const tabRegister = document.getElementById("auth-tab-register");
  if (!loginPanel || !registerPanel) return;

  const showLogin = () => {
    loginPanel.classList.remove("hidden");
    registerPanel.classList.add("hidden");
    forgotPanel?.classList.add("hidden");
    tabLogin?.classList.remove("hidden");
    tabRegister?.classList.remove("hidden");
    tabLogin?.classList.add("text-primary", "border-primary");
    tabLogin?.classList.remove("text-on-surface-variant", "border-transparent");
    tabRegister?.classList.remove("text-primary", "border-primary");
    tabRegister?.classList.add("text-on-surface-variant", "border-transparent");
  };
  const showRegister = () => {
    registerPanel.classList.remove("hidden");
    loginPanel.classList.add("hidden");
    forgotPanel?.classList.add("hidden");
    tabLogin?.classList.remove("hidden");
    tabRegister?.classList.remove("hidden");
    tabRegister?.classList.add("text-primary", "border-primary");
    tabRegister?.classList.remove("text-on-surface-variant", "border-transparent");
    tabLogin?.classList.remove("text-primary", "border-primary");
    tabLogin?.classList.add("text-on-surface-variant", "border-transparent");
  };
  const showForgot = () => {
    forgotPanel?.classList.remove("hidden");
    loginPanel.classList.add("hidden");
    registerPanel.classList.add("hidden");
    tabLogin?.classList.add("hidden");
    tabRegister?.classList.add("hidden");
    showMessage(document.getElementById("auth-forgot-success"), "");
    showError(document.getElementById("auth-forgot-error"), "");
    const loginPhone = document.getElementById("auth-login-phone");
    const forgotPhone = document.getElementById("auth-forgot-phone");
    if (loginPhone instanceof HTMLInputElement && forgotPhone instanceof HTMLInputElement && loginPhone.value) {
      forgotPhone.value = loginPhone.value;
    }
  };

  tabLogin?.addEventListener("click", (e) => {
    e.preventDefault();
    showLogin();
  });
  tabRegister?.addEventListener("click", (e) => {
    e.preventDefault();
    showRegister();
  });
  document.getElementById("auth-forgot-toggle")?.addEventListener("click", (e) => {
    e.preventDefault();
    showForgot();
  });
  document.getElementById("auth-forgot-back")?.addEventListener("click", (e) => {
    e.preventDefault();
    showLogin();
  });

  if (new URLSearchParams(location.search).get("register") === "1") showRegister();
  else showLogin();
}

async function main() {
  if (getCustomerToken()) {
    const next = new URLSearchParams(location.search).get("next");
    if (next && isSafeStorefrontPath(next)) {
      window.location.href = next;
      return;
    }
  }
  wireTabs();
  showCheckoutNotice();
  const loginForm = document.getElementById("auth-login-form");
  const registerForm = document.getElementById("auth-register-form");
  const forgotForm = document.getElementById("auth-forgot-form");
  const loginErr = document.getElementById("auth-login-error");
  const registerErr = document.getElementById("auth-register-error");
  const forgotErr = document.getElementById("auth-forgot-error");
  const forgotOk = document.getElementById("auth-forgot-success");

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(loginErr, "");
    const phone = document.getElementById("auth-login-phone")?.value;
    const password = document.getElementById("auth-login-password")?.value;
    const btn = loginForm.querySelector('button[type="submit"]');
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = true;
      btn.textContent = "جاري الدخول…";
    }
    try {
      await loginCustomer({ phone, password });
      window.location.href = postAuthRedirectHref();
    } catch (err) {
      showError(loginErr, err instanceof Error ? err.message : "فشل تسجيل الدخول");
    } finally {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = false;
        btn.textContent = "تسجيل الدخول";
      }
    }
  });

  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(registerErr, "");
    const name = document.getElementById("auth-register-name")?.value;
    const phone = document.getElementById("auth-register-phone")?.value;
    const password = document.getElementById("auth-register-password")?.value;
    const confirm = document.getElementById("auth-register-password2")?.value;
    if (String(password) !== String(confirm)) {
      showError(registerErr, "تأكيد كلمة المرور غير مطابق");
      return;
    }
    const btn = registerForm.querySelector('button[type="submit"]');
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = true;
      btn.textContent = "جاري إنشاء الحساب…";
    }
    try {
      await registerCustomer({ phone, name, password });
      window.location.href = postAuthRedirectHref();
    } catch (err) {
      showError(registerErr, err instanceof Error ? err.message : "فشل التسجيل");
    } finally {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = false;
        btn.textContent = "إنشاء حساب";
      }
    }
  });

  forgotForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(forgotErr, "");
    showMessage(forgotOk, "");
    const phone = document.getElementById("auth-forgot-phone")?.value;
    const btn = forgotForm.querySelector('button[type="submit"]');
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = true;
      btn.textContent = "جاري الإرسال…";
    }
    try {
      const msg = await requestPasswordReset({ phone });
      showMessage(forgotOk, msg, true);
    } catch (err) {
      showError(forgotErr, err instanceof Error ? err.message : "تعذر إرسال الطلب");
    } finally {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = false;
        btn.textContent = "إرسال الطلب للإدارة";
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", main);
