-- CreateTable
CREATE TABLE "agent_setup_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "adapter_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_setup_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_setup_tokens_token_key" ON "agent_setup_tokens"("token");

-- CreateIndex
CREATE INDEX "agent_setup_tokens_branch_id_status_idx" ON "agent_setup_tokens"("branch_id", "status");
