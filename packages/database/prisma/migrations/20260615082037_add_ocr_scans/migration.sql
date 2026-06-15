-- CreateTable
CREATE TABLE "ocr_scans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "scanned_by" UUID NOT NULL,
    "image_url" TEXT NOT NULL,
    "raw_ocr_result" JSONB,
    "parsed_lines" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocr_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ocr_scans_tenant_id_idx" ON "ocr_scans"("tenant_id");

-- CreateIndex
CREATE INDEX "ocr_scans_branch_id_status_idx" ON "ocr_scans"("branch_id", "status");

-- AddForeignKey
ALTER TABLE "ocr_scans" ADD CONSTRAINT "ocr_scans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_scans" ADD CONSTRAINT "ocr_scans_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_scans" ADD CONSTRAINT "ocr_scans_scanned_by_fkey" FOREIGN KEY ("scanned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_scans" ADD CONSTRAINT "ocr_scans_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
