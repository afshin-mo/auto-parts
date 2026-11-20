-- AlterTable
ALTER TABLE "inventory_transactions" ADD COLUMN     "reference_item_id" TEXT;

-- CreateTable
CREATE TABLE "inventory_lots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "unit_cost" DECIMAL(15,2) NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_lots_tenant_id_idx" ON "inventory_lots"("tenant_id");

-- CreateIndex
CREATE INDEX "inventory_lots_product_id_warehouse_id_idx" ON "inventory_lots"("product_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_lots_product_id_warehouse_id_unit_cost_key" ON "inventory_lots"("product_id", "warehouse_id", "unit_cost");

-- CreateIndex
CREATE INDEX "inventory_transactions_reference_item_id_idx" ON "inventory_transactions"("reference_item_id");

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
