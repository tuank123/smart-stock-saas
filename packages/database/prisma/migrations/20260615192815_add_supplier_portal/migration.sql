-- CreateTable
CREATE TABLE "branch_supplier_portals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "subdomain" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_supplier_portals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_portal_uploads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "supplier_id" UUID,
    "portal_id" UUID NOT NULL,
    "uploader_phone" TEXT NOT NULL,
    "otp_verified_at" TIMESTAMP(3) NOT NULL,
    "pdf_url" TEXT NOT NULL,
    "ocr_extracted_firm" TEXT,
    "ocr_extracted_phone" TEXT,
    "effective_phone" TEXT NOT NULL,
    "ocr_status" TEXT NOT NULL DEFAULT 'PENDING',
    "upload_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_portal_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branch_supplier_portals_subdomain_key" ON "branch_supplier_portals"("subdomain");

-- CreateIndex
CREATE INDEX "branch_supplier_portals_subdomain_idx" ON "branch_supplier_portals"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "branch_supplier_portals_branch_id_key" ON "branch_supplier_portals"("branch_id");

-- CreateIndex
CREATE INDEX "supplier_portal_uploads_tenant_id_idx" ON "supplier_portal_uploads"("tenant_id");

-- CreateIndex
CREATE INDEX "supplier_portal_uploads_branch_id_status_idx" ON "supplier_portal_uploads"("branch_id", "status");

-- AddForeignKey
ALTER TABLE "branch_supplier_portals" ADD CONSTRAINT "branch_supplier_portals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_supplier_portals" ADD CONSTRAINT "branch_supplier_portals_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_portal_uploads" ADD CONSTRAINT "supplier_portal_uploads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_portal_uploads" ADD CONSTRAINT "supplier_portal_uploads_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_portal_uploads" ADD CONSTRAINT "supplier_portal_uploads_portal_id_fkey" FOREIGN KEY ("portal_id") REFERENCES "branch_supplier_portals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_portal_uploads" ADD CONSTRAINT "supplier_portal_uploads_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_portal_uploads" ADD CONSTRAINT "supplier_portal_uploads_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
