-- CreateTable
CREATE TABLE "scheduled_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "report_type" TEXT NOT NULL,
    "report_date" DATE NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "pdf_url" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_change_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "branch_id" UUID,
    "old_price" DECIMAL(12,2) NOT NULL,
    "new_price" DECIMAL(12,2) NOT NULL,
    "change_pct" DECIMAL(5,2) NOT NULL,
    "category_avg_increase" DECIMAL(5,2),
    "anomaly_flag" BOOLEAN NOT NULL DEFAULT false,
    "anomaly_ratio" DECIMAL(5,2),
    "changed_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_reports_tenant_id_is_read_idx" ON "scheduled_reports"("tenant_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_reports_tenant_id_report_type_report_date_key" ON "scheduled_reports"("tenant_id", "report_type", "report_date");

-- CreateIndex
CREATE INDEX "price_change_logs_tenant_id_idx" ON "price_change_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "price_change_logs_tenant_id_anomaly_flag_idx" ON "price_change_logs"("tenant_id", "anomaly_flag");

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_change_logs" ADD CONSTRAINT "price_change_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_change_logs" ADD CONSTRAINT "price_change_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_change_logs" ADD CONSTRAINT "price_change_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_change_logs" ADD CONSTRAINT "price_change_logs_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
