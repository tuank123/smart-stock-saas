-- AlterTable
-- Var olan satırlar için (varsa) created_at + 12 saat ile geriye dönük
-- doldurma yapılır, ardından NOT NULL zorunluluğu eklenir — Prisma'nın
-- "required column without a default" reddini elle çözen standart 3 adımlı
-- desen (bkz. https://pris.ly/d/migrate-add-required-column).
-- Not: var olan tek satır (yerel dev'de) zaten status=USED, bu yüzden bu
-- geriye dönük değer hiçbir zaman süre kontrolüne konu olmayacak.
ALTER TABLE "agent_setup_tokens" ADD COLUMN     "expires_at" TIMESTAMP(3);

UPDATE "agent_setup_tokens" SET "expires_at" = "created_at" + INTERVAL '12 hours' WHERE "expires_at" IS NULL;

ALTER TABLE "agent_setup_tokens" ALTER COLUMN "expires_at" SET NOT NULL;
