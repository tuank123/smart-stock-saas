-- AlterTable
ALTER TABLE "debts" ADD COLUMN     "affects_stock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoice_date" TIMESTAMP(3),
ADD COLUMN     "product_lines" JSONB,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';
