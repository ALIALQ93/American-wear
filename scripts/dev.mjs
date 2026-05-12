/**
 * يشغّل API ثم ينتظر /api/health قبل تشغيل Vite — يتجنب ECONNREFUSED عندما يُحمّل المتصفح
 * قبل انتهاء initDb أو عند بطء اتصال Postgres.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readPortFromEnvFile() {
  const envPath = path.join(root, ".env");
  try {
    const txt = fs.readFileSync(envPath, "utf8");
    const m = txt.match(/^\s*PORT\s*=\s*(\d+)/m);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n <= 65535) return n;
    }
  } catch {
    /* لا ملف */
  }
  return Number(process.env.PORT) || 3000;
}

const port = readPortFromEnvFile();
const healthUrl = `http://127.0.0.1:${port}/api/health`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHealthOk() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(healthUrl, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

let api = null;
let vite = null;

function shutdown(signal) {
  try {
    vite?.kill(signal);
  } catch {
    /* ignore */
  }
  try {
    api?.kill(signal);
  } catch {
    /* ignore */
  }
}

process.on("SIGINT", () => {
  shutdown("SIGINT");
  process.exit(130);
});
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
  process.exit(143);
});

api = spawn(process.execPath, ["server/index.js"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env },
  windowsHide: true,
});

api.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

api.on("exit", (code, signal) => {
  if (vite && !vite.killed) {
    vite.kill(signal || "SIGTERM");
  }
  if (code != null && code !== 0) {
    process.exit(code);
  }
});

const deadline = Date.now() + 120_000;
while (Date.now() < deadline) {
  if (api.exitCode != null) {
    console.error(
      `[dev] توقفت عملية API قبل أن تصبح جاهزة (رمز ${api.exitCode}). راجع DATABASE_URL ورسائل الخطأ أعلاه.`,
    );
    process.exit(api.exitCode ?? 1);
  }
  if (await fetchHealthOk()) break;
  await sleep(350);
}

if (Date.now() >= deadline) {
  console.error(
    `[dev] انتهت مهلة انتظار API على المنفذ ${port} (${healthUrl}). تحقق من اتصال Postgres أو استخدم Session pooler في DATABASE_URL.`,
  );
  api.kill("SIGTERM");
  process.exit(1);
}

vite = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js")], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env },
  windowsHide: true,
});

vite.on("error", (err) => {
  console.error(err);
  shutdown("SIGTERM");
  process.exit(1);
});

vite.on("exit", (code, signal) => {
  if (api && !api.killed) api.kill(signal || "SIGTERM");
  process.exit(code ?? 0);
});
