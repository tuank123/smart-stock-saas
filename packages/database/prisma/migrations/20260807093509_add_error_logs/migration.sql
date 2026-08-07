-- CreateTable
CREATE TABLE "error_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'ERROR',
    "message" TEXT NOT NULL,
    "stack_trace" TEXT,
    "tenant_id" UUID,
    "branch_id" UUID,
    "context" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_logs_resolved_created_at_idx" ON "error_logs"("resolved", "created_at");

-- CreateIndex
CREATE INDEX "error_logs_source_idx" ON "error_logs"("source");
