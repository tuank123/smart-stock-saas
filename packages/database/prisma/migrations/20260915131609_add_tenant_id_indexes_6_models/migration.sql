-- CreateIndex
CREATE INDEX "agent_setup_tokens_tenant_id_idx" ON "agent_setup_tokens"("tenant_id");

-- CreateIndex
CREATE INDEX "branch_supplier_portals_tenant_id_idx" ON "branch_supplier_portals"("tenant_id");

-- CreateIndex
CREATE INDEX "cashier_sessions_tenant_id_idx" ON "cashier_sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "debts_tenant_id_idx" ON "debts"("tenant_id");

-- CreateIndex
CREATE INDEX "defective_item_reports_tenant_id_branch_id_status_idx" ON "defective_item_reports"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_created_at_idx" ON "stock_movements"("tenant_id", "created_at");
