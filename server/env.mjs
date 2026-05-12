import dns from "node:dns";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

/** يفضّل IPv4 لـ `getaddrinfo` — يقلّل ETIMEDOUT عندما يختار النظام سجلّ AAAA لـ `db.*.supabase.co` ومسار IPv6 غير قابل للوصول */
dns.setDefaultResultOrder("ipv4first");

/** تحميل `.env` من جذر المشروع حتى لو تغيّر cwd عند تشغيل `node server/index.js` */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });
