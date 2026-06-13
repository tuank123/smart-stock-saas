-- CreateTable
CREATE TABLE "branch_integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "adapter_type" TEXT NOT NULL,
    "agent_id" TEXT,
    "agent_version" TEXT,
    "webservice_url" TEXT,
    "api_key_encrypted" TEXT,
    "api_secret_encrypted" TEXT,
    "polling_interval_sec" INTEGER NOT NULL DEFAULT 10,
    "connection_status" TEXT NOT NULL DEFAULT 'PENDING_INSTALL',
    "last_read_sync_at" TIMESTAMP(3),
    "last_write_sync_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_adapters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "adapter_type" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "webservice_type" TEXT NOT NULL,
    "read_endpoint" TEXT NOT NULL,
    "write_endpoint" TEXT NOT NULL,
    "auth_type" TEXT NOT NULL,
    "field_mappings" JSONB NOT NULL,
    "supported_versions" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_adapters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_integrations_tenant_id_idx" ON "branch_integrations"("tenant_id");

-- CreateIndex
CREATE INDEX "branch_integrations_connection_status_idx" ON "branch_integrations"("connection_status");

-- CreateIndex
CREATE UNIQUE INDEX "branch_integrations_branch_id_key" ON "branch_integrations"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_adapters_adapter_type_key" ON "integration_adapters"("adapter_type");

-- AddForeignKey
ALTER TABLE "branch_integrations" ADD CONSTRAINT "branch_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_integrations" ADD CONSTRAINT "branch_integrations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
