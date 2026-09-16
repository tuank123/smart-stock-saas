-- AlterTable
ALTER TABLE "debt_payments" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "debts" ADD COLUMN     "category" TEXT,
ADD COLUMN     "related_debt_id" UUID;

-- CreateIndex
CREATE INDEX "debts_related_debt_id_idx" ON "debts"("related_debt_id");

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_related_debt_id_fkey" FOREIGN KEY ("related_debt_id") REFERENCES "debts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
