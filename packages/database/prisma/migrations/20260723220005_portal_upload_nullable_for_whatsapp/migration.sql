-- DropForeignKey
ALTER TABLE "supplier_portal_uploads" DROP CONSTRAINT "supplier_portal_uploads_portal_id_fkey";

-- AlterTable
ALTER TABLE "supplier_portal_uploads" ALTER COLUMN "portal_id" DROP NOT NULL,
ALTER COLUMN "otp_verified_at" DROP NOT NULL,
ALTER COLUMN "pdf_url" DROP NOT NULL,
ALTER COLUMN "ocr_status" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "supplier_portal_uploads" ADD CONSTRAINT "supplier_portal_uploads_portal_id_fkey" FOREIGN KEY ("portal_id") REFERENCES "branch_supplier_portals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
