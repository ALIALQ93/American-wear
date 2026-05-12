# American wear — تشغيل المشروع محلياً

> **لا تريد التشغيل على جهازك وتفكّر في GitHub؟** GitHub يحفظ الكود ويبنيه في CI؛ **استضافة المتجر للجمهور** تحتاج عادةً خدمة تشغّل Node (مثل Render أو Railway). اقرأ **`DEPLOY.md`** بلغة مبسّطة.

مشروع **واجهات HTML ثابتة** (Vite) + **خادم API** (Express على Node) + **PostgreSQL** على Supabase. لا يوجد إطار Next.js.

---

## ماذا يوجد في المشروع؟

| الجزء | الوصف |
|--------|--------|
| **واجهة المتجر** | صفحات تصميم (`home.html`, أقسام، تفاصيل منتج، إلخ) — **لا يوجد حالياً** تسجيل دخول للعملاء أو ربط حقيقي بسلة/دفع في الكود؛ التصفح للعرض والتجربة. |
| **لوحة الإدارة** | `admin/login.html` — مصادقة **Supabase Auth** (بريد + كلمة مرور)، ثم التحقق من الصلاحية عبر جدول **`admin_profiles`** أو القائمة **`ADMIN_ALLOWED_EMAILS`** في `.env`. |

---

## المتطلبات

- [Node.js](https://nodejs.org/) إصدار حديث (يُفضّل 18+).
- حساب [Supabase](https://supabase.com) ومشروع مفعّل.
- نسخ `.env.example` إلى `.env` وتعبئة القيم (راجع أيضاً **`SUPABASE.md`**).

---

## دليل المبتدئ: ماذا يعني `.env` وكيف يطابق Supabase؟

**ملف `.env`** ملف نصي في **جذر المشروع** (بجانب `package.json`) يحفظ **أسراراً وإعدادات** يقرأها البرنامج عند التشغيل. الاسم ثابت: **`.env`** (نقطة ثم `env`). لا يُرفع عادةً إلى Git.

### إنشاء الملف أول مرة

1. انسخ الملف **`.env.example`** والصقه في نفس المجلد باسم **`.env`**.
2. افتح **`.env`** في المحرر واستبدل القيم الوهمية (`YOUR_...`) بما يناسب مشروعك.

### مطابقة كل سطر مع لوحة Supabase

| ما تكتبه في `.env` | من أين تأتي القيمة في Supabase؟ |
|---------------------|----------------------------------|
| **`DATABASE_URL`** | **Project settings** (ترس) → **Database** → **Connection string** → انسخ **URI** أو **Session pooler** كما في التعليقات داخل `.env.example`. كلمة مرور قاعدة البيانات جزء من الرابط؛ إن وُجدت فيها **`=`** استخدم **`%3D`** بدلها داخل الرابط. |
| **`VITE_SUPABASE_URL`** | **Project settings** → **API** → **Project URL** (نفس عنوان المشروع `https://....supabase.co`). |
| **`VITE_SUPABASE_PUBLISHABLE_KEY`** | **Project settings** → **API** → **Publishable** أو **anon** (واحد يكفي لسطر الواجهة). |
| **`SUPABASE_URL`** | غالباً **نفس** `VITE_SUPABASE_URL` (من **API → Project URL**). |
| **`SUPABASE_ANON_KEY`** | **Project settings** → **API** → المفتاح **anon** الذي يبدأ بـ **`eyJ`** (يُفضّل للخادم). |
| **`PORT`** | ليس من Supabase — رقم منفذ محلي (مثل `3000`). |
| **`ADMIN_ALLOWED_EMAILS`** | تكتبه **أنت**: بريد مستخدم **أنشأته** من **Authentication** → **Users** في Supabase (نفس البريد بعد نجاح الدخول). |

**مستخدم تسجيل الدخول للإدارة:** أنشئه من Supabase → **Authentication** → **Users** (بريد + كلمة مرور)، ثم إما تضيف بريده في **`ADMIN_ALLOWED_EMAILS`** أو تنفّذ SQL في **`SUPABASE.md`** لجدول **`admin_profiles`**.

بعد كل تعديل على **`.env`** أعد تشغيل **`npm run dev`**.

---

## 1) تثبيت الحزم

```bash
npm install
```

---

## 2) إعداد `.env` (تفاصيل إضافية)

- راجع الجدول في قسم **«دليل المبتدئ»** أعلاه، والتعليقات الطويلة داخل **`.env.example`** (كل قسم يشرح المسار في Supabase).
- إن ظهر **`ETIMEDOUT`** أو IPv6: استخدم **Session pooler** في **`DATABASE_URL`**.
- للإدارة الكاملة وصفحة المسؤولين: **`SUPABASE.md`** (جدول `admin_profiles` و SQL لأول `super_admin`).

---

## 3) هجرات قاعدة البيانات

```bash
npm run db:login
npm run db:link
npm run db:push
```

أول مسؤول أعلى (`super_admin`): راجع **`SUPABASE.md`** — قسم SQL.

---

## 4) التشغيل للتطوير

```bash
npm run dev
```

- ينتظر السكربت حتى يقلع **API** ثم يشغّل **Vite** (لتفادي أخطاء وكيل `/api` مثل `ECONNREFUSED`).  
- للتشغيل المتوازي القديم: `npm run dev:parallel`.

### العناوين (افتراضياً)

| الرابط | الغرض |
|--------|--------|
| `http://localhost:5173/` | صفحة اختيار: **متجر** أو **إدارة** |
| `http://localhost:5173/home.html` | واجهة المتجر (عرض) |
| `http://localhost:5173/admin/login.html` | تسجيل دخول الإدارة |

التحقق من API بدون مصادقة: `http://127.0.0.1:<PORT>/api/health` (استبدل `<PORT>` بقيمة **`PORT`** في `.env`).

---

## 5) تسجيل دخول الإدارة (خطوات عملية)

1. في Supabase: **Authentication → Users** — أنشئ مستخدماً (بريد + كلمة مرور).
2. إما:
   - تضع بريده في **`ADMIN_ALLOWED_EMAILS`** في `.env` (دخول مؤقت بدور `admin`)، **أو**
   - تنفّذ SQL في **`SUPABASE.md`** لإضافته إلى **`admin_profiles`** بدور **`super_admin`**.
3. افتح **`/admin/login.html`** وسجّل الدخول بنفس بريد وكلمة مرور Supabase.

---

## 6) البناء والمعاينة

```bash
npm run build
npm run preview
```

إن كنت تنشر الواجهة على **GitHub Pages** بينما الـ API على خادم آخر: عيّن وقت البناء المتغير **`VITE_API_ORIGIN`** (مثلاً في أسرار GitHub Actions) إلى عنوان الـ API العام بدون `/` في النهاية — التفاصيل في **`DEPLOY.md`**.

---

## ملفات مرجعية

- **`DEPLOY.md`** — **النشر على الإنترنت** وعلاقة GitHub بالاستضافة (لغير المبرمجين).  
- **`SUPABASE.md`** — Supabase، CLI، `.env`، SQL لأول مسؤول أعلى.  
- **`.env.example`** — قالب `.env` مع **تعليقات عربية** تربط كل متغير بمساره في لوحة Supabase.
