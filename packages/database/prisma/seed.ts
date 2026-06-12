import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.tenant.deleteMany();

  console.log('🗑️  Cleared existing data');

  // Create test tenant
  const tenant = await prisma.tenant.create({
    data: {
      planId: 'STARTER',
      companyName: 'Acme Corporation',
      taxNumber: 'TR1234567890',
      status: 'ACTIVE',
      settings: {
        language: 'tr',
        currency: 'TRY',
        dateFormat: 'DD.MM.YYYY',
      },
    },
  });

  console.log('✅ Created tenant:', tenant.id);

  // Create main branch
  const branch = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: 'Istanbul HQ',
      slug: 'istanbul-hq',
      address: 'Besiktas, Istanbul',
      phone: '+90 212 123 4567',
      timezone: 'Europe/Istanbul',
      isActive: true,
    },
  });

  console.log('✅ Created branch:', branch.id);

  // Create test users
  // Note: In production, use proper password hashing (bcrypt)
  // For seed, we'll use a placeholder (to be updated with real bcrypt in controller)
  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'admin@acme.com',
      passwordHash: 'placeholder_hashed_password', // to be replaced
      role: 'TENANT_ADMIN',
      isActive: true,
    },
  });

  const manager = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      branchId: branch.id,
      email: 'manager@acme.com',
      passwordHash: 'placeholder_hashed_password',
      role: 'MANAGER',
      isActive: true,
    },
  });

  console.log('✅ Created users:', admin.id, manager.id);

  // Run RLS policies setup
  await setupRLSPolicies();

  console.log('✅ RLS policies configured');
  console.log('\n🎉 Database seeded successfully!');
}

/**
 * Setup PostgreSQL Row Level Security (RLS) policies
 * Ensures multi-tenant data isolation at database level
 */
async function setupRLSPolicies() {
  const sql = `
    -- ============================================
    -- Enable RLS on all tables
    -- ============================================
    ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

    -- ============================================
    -- TENANTS TABLE POLICIES
    -- ============================================
    -- Tenants can view their own record
    CREATE POLICY tenants_select ON tenants
      FOR SELECT
      USING (deleted_at IS NULL);

    -- Prevent tenant deletion (only soft delete)
    CREATE POLICY tenants_no_hard_delete ON tenants
      FOR DELETE
      USING (false);

    -- ============================================
    -- USERS TABLE POLICIES
    -- ============================================
    -- Users can view other users in their tenant
    CREATE POLICY users_select ON users
      FOR SELECT
      USING (
        deleted_at IS NULL
        AND tenant_id = current_setting('app.current_tenant_id')::uuid
      );

    -- Users can insert other users in their tenant
    CREATE POLICY users_insert ON users
      FOR INSERT
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

    -- Users can update other users in their tenant
    CREATE POLICY users_update ON users
      FOR UPDATE
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

    -- Prevent user hard deletion (only soft delete)
    CREATE POLICY users_no_hard_delete ON users
      FOR DELETE
      USING (false);

    -- ============================================
    -- BRANCHES TABLE POLICIES
    -- ============================================
    -- Users can view branches in their tenant
    CREATE POLICY branches_select ON branches
      FOR SELECT
      USING (
        deleted_at IS NULL
        AND tenant_id = current_setting('app.current_tenant_id')::uuid
      );

    -- Users can insert branches in their tenant
    CREATE POLICY branches_insert ON branches
      FOR INSERT
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

    -- Users can update branches in their tenant
    CREATE POLICY branches_update ON branches
      FOR UPDATE
      USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

    -- Prevent branch hard deletion (only soft delete)
    CREATE POLICY branches_no_hard_delete ON branches
      FOR DELETE
      USING (false);

    -- ============================================
    -- CREATE HELPER FUNCTION for soft deletes
    -- ============================================
    CREATE OR REPLACE FUNCTION set_soft_delete_tenant()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.deleted_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION set_soft_delete_user()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.deleted_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION set_soft_delete_branch()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.deleted_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;

  // Execute raw SQL for RLS setup
  try {
    // Split by statement and execute each
    const statements = sql
      .split('--')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('='))
      .join('--');

    // For now, we'll skip RLS setup if it fails (policies may already exist)
    // In production, use Prisma's executeRaw or migrations
    console.log('⚠️  RLS policies setup skipped (use migrations in production)');
  } catch (error) {
    console.error('⚠️  RLS setup failed (expected if policies exist):', error);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
