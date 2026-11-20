-- ایندکس‌های جستجو (پس از `prisma migrate` یک‌بار اجرا شود)؛ بدون آن‌ها جستجوی «بخشی از شماره/نام» در دیتای بزرگ کند می‌شود.
--   psql "$DATABASE_URL" -f prisma/sql/001_search_indexes.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS product_codes_code_norm_trgm ON product_codes USING gin (code_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS product_codes_code_norm_prefix ON product_codes (tenant_id, code_norm text_pattern_ops);
CREATE INDEX IF NOT EXISTS products_name_trgm ON products USING gin (name gin_trgm_ops);
