-- AlterTable
ALTER TABLE "debts" ADD COLUMN     "last_payment_amount" DECIMAL(12,2),
ADD COLUMN     "last_payment_date" TIMESTAMP(3),
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "remaining_amount" DECIMAL(12,2);
