-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "person_name" VARCHAR(120) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "withdrawals_tenant_id_date_idx" ON "withdrawals"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "withdrawals_tenant_id_person_name_idx" ON "withdrawals"("tenant_id", "person_name");

-- CreateIndex
CREATE INDEX "withdrawals_tenant_id_branch_id_date_idx" ON "withdrawals"("tenant_id", "branch_id", "date");
