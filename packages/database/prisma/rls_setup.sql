-- Row-Level Security (RLS) Setup for StokPilot
-- This file should be run manually against the database to enable RLS policies
-- It's not part of Prisma migrations as RLS policies must be set after authentication context is available
-- 
-- Run this in psql or your database client:
-- \i packages/database/prisma/rls_setup.sql

-- ============================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_registration_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TENANT ISOLATION POLICIES
-- ============================================

-- Tenants policy: Users can only see their own tenant (or all if SUPER_ADMIN)
CREATE POLICY tenant_isolation ON tenants
  FOR SELECT
  USING (
    id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- Users policy: Users can only see users in their tenant (or all if SUPER_ADMIN)
CREATE POLICY tenant_isolation ON users
  FOR SELECT
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- Branches policy: Users can only see branches in their tenant (or all if SUPER_ADMIN)
CREATE POLICY tenant_isolation ON branches
  FOR SELECT
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- Staff registration tokens policy: Users can only see tokens for their tenant (or all if SUPER_ADMIN)
CREATE POLICY tenant_isolation ON staff_registration_tokens
  FOR SELECT
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ============================================
-- WRITE POLICIES (INSERT, UPDATE, DELETE)
-- ============================================

-- Tenants: Only SUPER_ADMIN can modify
CREATE POLICY tenant_modification ON tenants
  FOR UPDATE
  USING (current_setting('app.is_super_admin', true) = 'true');

CREATE POLICY tenant_creation ON tenants
  FOR INSERT
  WITH CHECK (current_setting('app.is_super_admin', true) = 'true');

CREATE POLICY tenant_deletion ON tenants
  FOR DELETE
  USING (current_setting('app.is_super_admin', true) = 'true');

-- Users: Can modify users in their own tenant
CREATE POLICY users_modification ON users
  FOR UPDATE
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY users_creation ON users
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY users_deletion ON users
  FOR DELETE
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- Branches: Can modify branches in their own tenant
CREATE POLICY branches_modification ON branches
  FOR UPDATE
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY branches_creation ON branches
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY branches_deletion ON branches
  FOR DELETE
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- Staff registration tokens: Can modify tokens in their own tenant
CREATE POLICY srt_modification ON staff_registration_tokens
  FOR UPDATE
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY srt_creation ON staff_registration_tokens
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY srt_deletion ON staff_registration_tokens
  FOR DELETE
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ============================================
-- COMPLETED
-- ============================================
-- RLS is now enabled on all tables with tenant isolation policies
-- Make sure to call PrismaService.setTenantContext() before executing queries
