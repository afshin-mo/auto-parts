-- بعد از `prisma migrate` (ساخت جدول inventory_lots): موجودی فعلی را به‌عنوان یک ردیف با قیمت خرید فعلی کالا ثبت می‌کند.
-- ایدمپوتنت: فقط برای کالا/انباری که هنوز ردیف ندارد؛ بعدش 002_rls.sql را دوباره اجرا کنید.
INSERT INTO inventory_lots (id, tenant_id, product_id, warehouse_id, unit_cost, quantity, created_at, updated_at)
SELECT gen_random_uuid()::text, i.tenant_id, i.product_id, i.warehouse_id, p.purchase_price, i.quantity, now(), now()
  FROM inventory i JOIN products p ON p.id = i.product_id
 WHERE i.quantity > 0
   AND NOT EXISTS (SELECT 1 FROM inventory_lots l WHERE l.product_id = i.product_id AND l.warehouse_id = i.warehouse_id);
