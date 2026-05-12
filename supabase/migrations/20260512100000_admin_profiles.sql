-- صلاحيات مسؤولي لوحة الإدارة: يُنشأ المستخدم أولاً في Supabase Authentication ثم يُربط بصف هنا.
-- الخادم يتحقق من JWT ثم من هذا الجدول (أو مؤقتاً من ADMIN_ALLOWED_EMAILS في .env).

CREATE TABLE public.admin_profiles (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_profiles_email_lower_idx ON public.admin_profiles (lower(email));

COMMENT ON TABLE public.admin_profiles IS 'ربط auth.users بصلاحية لوحة الإدارة؛ super_admin يدير الصفوف عبر API.';
