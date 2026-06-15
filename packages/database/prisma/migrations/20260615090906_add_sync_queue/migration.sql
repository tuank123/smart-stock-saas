-- CreateTable
CREATE TABLE "sync_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "operation_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "adapter_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "sync_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "queue_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "request_payload" TEXT,
    "response_payload" TEXT,
    "status" TEXT NOT NULL,
    "error_detail" TEXT,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_queue_tenant_id_idx" ON "sync_queue"("tenant_id");

-- CreateIndex
CREATE INDEX "sync_queue_branch_id_status_idx" ON "sync_queue"("branch_id", "status");

-- CreateIndex
CREATE INDEX "sync_logs_tenant_id_idx" ON "sync_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "sync_logs_queue_id_idx" ON "sync_logs"("queue_id");

-- AddForeignKey
ALTER TABLE "sync_queue" ADD CONSTRAINT "sync_queue_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_queue" ADD CONSTRAINT "sync_queue_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_queue" ADD CONSTRAINT "sync_queue_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "sync_queue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
