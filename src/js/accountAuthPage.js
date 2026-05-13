import { escapeHtml } from "./storefrontCommon.js";
import { loginCustomer, registerCustomer } from "./customerSession.js";

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
  const tabLogin = document.getElementById("auth-tab-login");
  const tabRegister = document.getElementById("auth-tab-register");
  if (!loginPanel || !registerPanel) return;

  const showLogin = () => {
    loginPanel.classList.remove("hidden");
    registerPanel.classList.add("hidden");
    tabLogin?.classList.add("text-primary", "border-primary");
    tabLogin?.classList.remove("text-on-surface-variant", "border-transparent");
    tabRegister?.classList.remove("text-primary", "border-primary");
    tabRegister?.classList.add("text-on-surface-variant", "border-transparent");
  };
  const showRegister = () => {
    registerPanel.classList.remove("hidden");
    loginPanel.classList.add("hidden");
    tabRegister?.classList.add("text-primary", "border-primary");
    tabRegister?.classList.remove("text-on-surface-variant", "border-transparent");
    tabLogin?.classList.remove("text-primary", "border-primary");
    tabLogin?.classList.add("text-on-surface-variant", "border-transparent");
  };

  tabLogin?.addEventListener("click", (e) => {
    e.preventDefault();
    showLogin();
  });
  tabRegister?.addEventListener("click", (e) => {
    e.preventDefault();
    showRegister();
  });

  if (new URLSearchParams(location.search).get("register") === "1") showRegister();
  else showLogin();
}

async function main() {
  wireTabs();
  const loginForm = document.getElementById("auth-login-form");
  const registerForm = document.getElementById("auth-register-form");
  const loginErr = document.getElementById("auth-login-error");
  const registerErr = document.getElementById("auth-register-error");

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
      const next = new URLSearchParams(location.search).get("next");
      window.location.href = next && next.startsWith("./") ? next : "./account-orders.html";
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
      window.location.href = "./account-orders.html";
    } catch (err) {
      showError(registerErr, err instanceof Error ? err.message : "فشل التسجيل");
    } finally {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = false;
        btn.textContent = "إنشاء حساب";
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", main);
