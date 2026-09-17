-- CreateTable
CREATE TABLE "supplier_ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "source_debt_id" UUID,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_tenant_id_branch_id_supplier_id_cre_idx" ON "supplier_ledger_entries"("tenant_id", "branch_id", "supplier_id", "created_at");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_tenant_id_branch_id_supplier_id_typ_idx" ON "supplier_ledger_entries"("tenant_id", "branch_id", "supplier_id", "type", "created_at");

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
