-- فقط برای دیتابیسی که از قبل داده دارد (نسخه‌ی پیش از ایزوله‌سازی).
-- ستون tenant_id روی ۵ جدول زیر NOT NULL است و `migrate dev` روی جدول پر خطا می‌دهد. روش:
--   npx prisma migrate dev --create-only --name tenant_columns
--   سپس در migration.sql ساخته‌شده، همه‌ی خط‌های `ADD COLUMN "tenant_id"` و `CREATE INDEX …_tenant_id_idx` این ۵ جدول
--   را با محتوای همین فایل جایگزین کنید و `npx prisma migrate dev` را بزنید.
-- tenant_id هر ردیف از والدش پر می‌شود؛ ردیف یتیم (والد حذف‌شده) نمی‌تواند وجود داشته باشد چون FK دارد.
ALTER TABLE "inventory" ADD COLUMN "tenant_id" TEXT;
UPDATE "inventory" x SET "tenant_id" = p."tenant_id" FROM "products" p WHERE p."id" = x."product_id";
ALTER TABLE "inventory" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "inventory_tenant_id_idx" ON "inventory"("tenant_id");

ALTER TABLE "invoice_items" ADD COLUMN "tenant_id" TEXT;
UPDATE "invoice_items" x SET "tenant_id" = i."tenant_id" FROM "invoices" i WHERE i."id" = x."invoice_id";
ALTER TABLE "invoice_items" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "invoice_items_tenant_id_idx" ON "invoice_items"("tenant_id");

ALTER TABLE "user_branches" ADD COLUMN "tenant_id" TEXT;
UPDATE "user_branches" x SET "tenant_id" = u."tenant_id" FROM "users" u WHERE u."id" = x."user_id";
ALTER TABLE "user_branches" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "user_branches_tenant_id_idx" ON "user_branches"("tenant_id");

ALTER TABLE "product_vehicle_compatibilities" ADD COLUMN "tenant_id" TEXT;
UPDATE "product_vehicle_compatibilities" x SET "tenant_id" = p."tenant_id" FROM "products" p WHERE p."id" = x."product_id";
ALTER TABLE "product_vehicle_compatibilities" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "product_vehicle_compatibilities_tenant_id_idx" ON "product_vehicle_compatibilities"("tenant_id");

ALTER TABLE "product_substitutes" ADD COLUMN "tenant_id" TEXT;
UPDATE "product_substitutes" x SET "tenant_id" = p."tenant_id" FROM "products" p WHERE p."id" = x."product_id";
ALTER TABLE "product_substitutes" ALTER COLUMN "tenant_id" SET NOT NULL;
CREATE INDEX "product_substitutes_tenant_id_idx" ON "product_substitutes"("tenant_id");
