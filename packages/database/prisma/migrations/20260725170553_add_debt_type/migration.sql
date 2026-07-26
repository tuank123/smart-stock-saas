-- AlterTable
ALTER TABLE "debts" ADD COLUMN     "debt_type" TEXT NOT NULL DEFAULT 'CASH',
ADD COLUMN     "product_description" TEXT,
ALTER COLUMN "amount" DROP NOT NULL;
