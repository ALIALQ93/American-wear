# العمل مع Supabase (American wear)

الخادم يتصل **فقط** بـ Postgres عبر `DATABASE_URL` (لا يوجد SQLite محلي). مسؤولو الإدارة يُنشأون في **Supabase Authentication**؛ ثم يُربَطون بجدول **`admin_profiles`** للصلاحيات (`super_admin` / `admin`)، مع إمكانية احتياطي **`ADMIN_ALLOWED_EMAILS`** في `.env` للدخول قبل إكمال الربط **عند تشغيل خادم Node فقط** — واجهة الإدارة المنشورة على **GitHub Pages** تتصل بقاعدة البيانات عبر **Supabase من المتصفح** وتتطلب صفاً في `admin_profiles` (انظر هجرة `20260520140000_rls_github_pages_admin.sql`).

## المتطلبات

- مشروع [Supabase](https://supabase.com).
- [Supabase CLI](https://supabase.com/docs/guides/cli) عبر `npx supabase`.

## 1) تسجيل الدخول في الـ CLI

```bash
npm run db:login
```

## 2) ربط المشروع بمشروع Supabase

```bash
npm run db:link
```

أو:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

## 3) نشر الهجرات

```bash
npm run db:push
```

تُنشئ الجداول: `products`, `orders`, `size_templates`, ثم `categories` و `category_sections`، ثم **`admin_profiles`** (ربط `auth.users` بصلاحية لوحة الإدارة). لا يوجد جدول `admins` في Postgres — هجرة `20260511183000_drop_public_admins.sql` تُسقط الجدول إن وُجد من نشر قديم.

هجرة **`20260522120000_storage_category_images.sql`** تُنشئ دلو **`category-images`** في Storage (قراءة عامة، رفع/تعديل/حذف لمسؤول نشط فقط) لرفع صور أغلفة التصنيفات من لوحة «التصنيفات»؛ بدون تطبيقها يظهر خطأ عند محاولة الرفع من الجهاز.

## 4) ملف `.env`

1. انسخ `.env.example` إلى `.env`.
2. **`DATABASE_URL`**: إلزامي — من **Settings → Database** → URI (كلمة مرور قاعدة البيانات). إذا ظهر `ETIMEDOUT` مع عنوان يشبه IPv6، يفضّل المشروع الاتصال بـ IPv4 تلقائياً (`server/env.mjs`); إن استمر الفشل جرّب **Session pooler** من نفس صفحة الاتصالات في Supabase.
3. **`VITE_SUPABASE_URL`** مع أحد المفتاحين **`VITE_SUPABASE_PUBLISHABLE_KEY`** أو **`VITE_SUPABASE_ANON_KEY`** (JWT): لصفحة `admin/login`. يمكن استخدام **`NEXT_PUBLIC_*`** بدلاً من **`VITE_*`**.
4. **`SUPABASE_URL`** و **`SUPABASE_ANON_KEY`**: لخادم Node و`auth.getUser` — إن لم تُعرّفا يُقرأان من **`VITE_*`** / **`NEXT_PUBLIC_*`** تلقائياً إن وُجدتا؛ للإنتاج يُفضّل تعريف **`SUPABASE_*`** صراحةً.
5. **`ADMIN_ALLOWED_EMAILS`**: اختياري كاحتياطي — مسموح بالدخول عبر **خادم Node** إن لم يكن للمستخدم صف في `admin_profiles` بعد. **لا يُطبَّق** عند فتح لوحة الإدارة من GitHub Pages (لا يوجد Express هناك)؛ على Pages يلزم صف في **`admin_profiles`**.
6. في **Authentication → Users** أنشئ مستخدماً، ثم من لوحة الإدارة **المسؤولون** (أو SQL أدناه) اربط `user_id` بالجدول.

## 5) أول مسؤول أعلى (SQL)

بعد `db:push` وإنشاء المستخدم في Auth، نفّذ في **SQL Editor** (استبدل البريد):

```sql
INSERT INTO public.admin_profiles (user_id, email, role, is_active)
SELECT id, email, 'super_admin', true
FROM auth.users
WHERE lower(email) = lower('you@example.com')
ON CONFLICT (user_id) DO UPDATE SET role = excluded.role, is_active = true, email = excluded.email;
```

يجب أن يكون **أول** صف في `admin_profiles` (أو أول ربط من واجهة المسؤولين) بدور **`super_admin`** ما دام لا يوجد مسؤول أعلى **نشط**؛ بعدها يُسمح بـ **`admin`**. لا يمكن إزالة أو تخفيض **آخر** `super_admin` نشط (يُفرَض عبر محفّز في قاعدة البيانات بعد هجرة RLS).

## 6) التشغيل

```bash
npm run dev
```

**دليل التشغيل السريع للمطور:** راجع **`README.md`** في جذر المشروع (متجر مقابل إدارة، عناوين التطوير، تسجيل الدخول).

بدون `DATABASE_URL` يتوقف الخادم عند البدء برسالة توضيحية.

## 6bis) GitHub Pages + Supabase (بدون Render)

بعد تطبيق الهجرة **`20260520140000_rls_github_pages_admin.sql`** (`npm run db:push`):

- لوحة الإدارة تقرأ وتكتب عبر **عميل Supabase** مع **RLS**.
- لا حاجة إلى **`VITE_API_ORIGIN`** لصفحات الإدارة على Pages (يبقى اختياريً لأي استخدام آخر لاحقاً).
- دوال مساعدة: **`admin_dashboard_stats`** (إحصائيات الرئيسية)، و**`is_active_admin` / `is_super_admin`** للسياسات.

## 7) الإنتاج

- الأسرار عبر Secrets على الاستضافة.
- لا تُخزَّن كلمات مرور المسؤولين في Postgres؛ المصادقة من **Authentication**، والصلاحيات من **`admin_profiles`** (مع احتياطي **`ADMIN_ALLOWED_EMAILS`** إن رغبت).

## 8) معالج Supabase «Next.js App Router» مقابل هذا المشروع

لوحة Supabase تقترح: `npm install @supabase/supabase-js @supabase/ssr` ثم ملفات `utils/supabase/server.ts` و`middleware.ts` و`page.tsx` — ذلك **خاص بمشروع Next.js** (كوكيز `next/headers` وتحديث الجلسة في Middleware).

**هنا (Vite + Express + صفحات HTML ثابتة):**

| في قالب Next | المكافئ عندنا |
|---------------|----------------|
| `@supabase/supabase-js` + `@supabase/ssr` | مثبّت: `@supabase/supabase-js` فقط — **بدون** `@supabase/ssr` |
| `.env.local` بـ `NEXT_PUBLIC_*` | نفس المتغيرات في `.env` (أو `VITE_*`) — `vite.config.js` يعرّض `NEXT_PUBLIC_` |
| `createBrowserClient` من `@supabase/ssr` | `src/lib/supabase/client.js` + `admin/js/supabaseAuth.js` |
| `createServerClient` + cookies | `server/lib/supabase/server.js` + التحقق من Bearer على Express |
| Middleware لتحديث الجلسة | `syncAdminTokenFromSupabaseSession` عند تحميل الصفحات + `onAuthStateChange` |

**مهارات الوكيل (اختياري):**  
`npx skills add supabase/agent-skills` — مفيدة لأدوات الذكاء الصناعي، وليست مطلوباً لتشغيل المشروع.

---

[Supabase CLI reference](https://supabase.com/docs/reference/cli)
