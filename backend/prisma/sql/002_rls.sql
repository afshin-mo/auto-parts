-- ایزوله‌سازی فروشگاه‌ها در خود Postgres (Row-Level Security)
--
-- اجرا: بعد از `prisma migrate` و 001، با کاربر «مالک» جدول‌ها (همان که migrate را اجرا می‌کند، نه کاربر برنامه):
--   psql "$OWNER_DATABASE_URL" -v app_password='رمز-کاربر-برنامه' -f prisma/sql/002_rls.sql
-- سپس DATABASE_URL برنامه را روی کاربر `auto_parts_app` بگذارید. بعد از هر migrate که جدول تازه می‌سازد دوباره اجرا کنید
-- (ایدمپوتنت است؛ اگر جدولی بدون سیاست بماند اسکریپت خطا می‌دهد).
--
-- مدل:
--  * auto_parts_app    : کاربر ورود برنامه؛ مشمول RLS؛ فقط ردیف‌هایی با tenant_id = app.tenant_id را می‌بیند/می‌نویسد.
--  * auto_parts_system : فقط با SET ROLE (کد برنامه آن را در ورود/ثبت‌نام/لینک پرداخت عمومی می‌گیرد)؛ همه‌ی ردیف‌ها.
--  * مالک جدول‌ها      : از RLS معاف است (migrate، seed، backfill). RLS برای مالک عمداً FORCE نشده.
-- بدون app.tenant_id هیچ ردیفی دیده نمی‌شود و نوشتن خطا می‌دهد (fail-closed).
\set ON_ERROR_STOP on
SET client_min_messages = warning;
BEGIN;

SELECT 'CREATE ROLE auto_parts_system NOLOGIN'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auto_parts_system') \gexec
-- NOINHERIT: کاربر برنامه بدون SET ROLE صریح، دسترسی نقش سیستمی را ندارد
SELECT format('CREATE ROLE auto_parts_app LOGIN NOINHERIT PASSWORD %L', :'app_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auto_parts_app') \gexec
SELECT format('ALTER ROLE auto_parts_app NOINHERIT PASSWORD %L', :'app_password') \gexec
GRANT auto_parts_system TO auto_parts_app;

GRANT USAGE ON SCHEMA public TO auto_parts_app, auto_parts_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO auto_parts_app, auto_parts_system;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO auto_parts_app, auto_parts_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO auto_parts_app, auto_parts_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO auto_parts_app, auto_parts_system;
DO $$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON public._prisma_migrations FROM auto_parts_app, auto_parts_system;
  END IF;
END $$;

DO $$
DECLARE
  t   text;
  cur text := $c$tenant_id = current_setting('app.tenant_id', true)$c$;
  own text := $c$(tenant_id = current_setting('app.tenant_id', true)
               OR (tenant_id IS NULL AND current_setting('app.is_super', true) = 'on'))$c$;
BEGIN
  -- ۱) جدول‌هایی که tenant_id اجباری دارند: خودکار، پس جدول‌های آینده هم پوشش می‌گیرند
  FOR t IN SELECT table_name FROM information_schema.columns
            WHERE table_schema = 'public' AND column_name = 'tenant_id' AND is_nullable = 'NO' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I TO auto_parts_app USING (%s) WITH CHECK (%s)', t, cur, cur);
    EXECUTE format('DROP POLICY IF EXISTS system_all ON %I', t);
    EXECUTE format('CREATE POLICY system_all ON %I TO auto_parts_system USING (true) WITH CHECK (true)', t);
  END LOOP;

  -- ۲) داده‌ی پایه: tenant_id = null یعنی سیستمی؛ همه می‌خوانند، فقط مدیر سیستم (app.is_super) می‌نویسد
  FOREACH t IN ARRAY ARRAY['brands', 'categories', 'units', 'vehicles'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_read ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON %I', t);
    EXECUTE format('CREATE POLICY tenant_read ON %I FOR SELECT TO auto_parts_app USING (tenant_id IS NULL OR %s)', t, cur);
    EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT TO auto_parts_app WITH CHECK (%s)', t, own);
    EXECUTE format('CREATE POLICY tenant_update ON %I FOR UPDATE TO auto_parts_app USING (%s) WITH CHECK (%s)', t, own, own);
    EXECUTE format('CREATE POLICY tenant_delete ON %I FOR DELETE TO auto_parts_app USING (%s)', t, own);
    EXECUTE format('DROP POLICY IF EXISTS system_all ON %I', t);
    EXECUTE format('CREATE POLICY system_all ON %I TO auto_parts_system USING (true) WITH CHECK (true)', t);
  END LOOP;

  -- ۳) گزارش ممیزی: هر فروشگاه فقط مال خودش را می‌خواند و می‌نویسد؛ ویرایش/حذف ممنوع
  ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_read ON audit_logs;
  DROP POLICY IF EXISTS tenant_insert ON audit_logs;
  CREATE POLICY tenant_read ON audit_logs FOR SELECT TO auto_parts_app USING (tenant_id = current_setting('app.tenant_id', true));
  CREATE POLICY tenant_insert ON audit_logs FOR INSERT TO auto_parts_app WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  DROP POLICY IF EXISTS system_all ON audit_logs;
  CREATE POLICY system_all ON audit_logs TO auto_parts_system USING (true) WITH CHECK (true);

  -- ۴) خود جدول فروشگاه‌ها
  ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS tenant_isolation ON tenants;
  CREATE POLICY tenant_isolation ON tenants TO auto_parts_app
    USING (id = current_setting('app.tenant_id', true)) WITH CHECK (id = current_setting('app.tenant_id', true));
  DROP POLICY IF EXISTS system_all ON tenants;
  CREATE POLICY system_all ON tenants TO auto_parts_system USING (true) WITH CHECK (true);
END $$;

-- جدولی که سیاست نگرفته (مثلاً جدول تازه‌ای بدون tenant_id) باید آگاهانه تصمیم‌گیری شود، نه بی‌صدا بی‌حفاظ بماند
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO missing
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity AND c.relname <> '_prisma_migrations';
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'جدول بدون RLS: %', missing; END IF;
END $$;

COMMIT;

-- بازگشت اضطراری (با کاربر مالک): RLS را بردارید و DATABASE_URL را به کاربر مالک برگردانید
--   DO $$ DECLARE r record; BEGIN FOR r IN SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity LOOP
--     EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', r.relname); END LOOP; END $$;
