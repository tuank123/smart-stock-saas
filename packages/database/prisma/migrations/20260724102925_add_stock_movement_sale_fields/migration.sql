-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "payment_method" TEXT,
ADD COLUMN     "unit_price" DECIMAL(12,2);
