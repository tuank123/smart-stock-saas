/**
 * Playwright UI testlerinin (apps/web/e2e-ui) sabit kodlanmış hesaplarını
 * oluşturur: admin@acme.com (PATRON) ve manager@acme.com (SUBE_MUDURU),
 * ikisi de aynı STARTER-planlı tenant + branch altında.
 *
 * Yerelde (stok_dev) bu hesaplar zaten manuel olarak var. CI'da her
 * çalıştırma taze/boş bir veritabanıyla başladığı için bu script CI'ın
 * "seed" adımı olarak kullanılır. İdempotent: e-posta zaten varsa dokunmaz.
 *
 * create-super-admin.ts ile aynı desen (dotenv, RLS bypass, bcrypt).
 *
 * Kullanım: ts-node src/scripts/seed-ui-test-users.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // fallback, üzerine yazmaz

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { withTenantContext } from '../common/utils/tenant-context';

const TAX_NUMBER = 'UI-TEST-0000000001';
const COMPANY_NAME = 'UI Test Ltd';

const USERS = [
  { email: 'admin@acme.com', password: 'Admin123!', role: 'PATRON' as const, fullName: 'UI Test Admin' },
  { email: 'manager@acme.com', password: 'Manager123!', role: 'SUBE_MUDURU' as const, fullName: 'UI Test Manager' },
];

async function main() {
  const prisma = new PrismaClient();
  const rounds = process.env.BCRYPT_ROUNDS ? parseInt(process.env.BCRYPT_ROUNDS, 10) : 4;

  try {
    await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
      let tenant = await tx.tenant.findUnique({
        where: { taxNumber: TAX_NUMBER },
        select: { id: true },
      });
      if (!tenant) {
        tenant = await tx.tenant.create({
          data: {
            companyName: COMPANY_NAME,
            taxNumber: TAX_NUMBER,
            planId: 'STARTER',
            status: 'ACTIVE',
            settings: { language: 'tr', currency: 'TRY' },
          },
          select: { id: true },
        });
        console.log(`✅ Tenant oluşturuldu: ${tenant.id}`);
      } else {
        console.log(`ℹ️  Tenant zaten var: ${tenant.id}`);
      }

      let branch = await tx.branch.findFirst({
        where: { tenantId: tenant.id },
        select: { id: true },
      });
      if (!branch) {
        branch = await tx.branch.create({
          data: { tenantId: tenant.id, name: 'Merkez', slug: 'merkez' },
          select: { id: true },
        });
        console.log(`✅ Branch oluşturuldu: ${branch.id}`);
      } else {
        console.log(`ℹ️  Branch zaten var: ${branch.id}`);
      }

      for (const u of USERS) {
        const existing = await tx.user.findFirst({
          where: { email: u.email, deletedAt: null },
          select: { id: true },
        });
        if (existing) {
          console.log(`ℹ️  ${u.email} zaten var — atlandı.`);
          continue;
        }

        const passwordHash = await bcrypt.hash(u.password, rounds);
        const created = await tx.user.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            email: u.email,
            fullName: u.fullName,
            passwordHash,
            role: u.role,
            isActive: true,
          },
          select: { id: true },
        });
        console.log(`✅ ${u.email} (${u.role}) oluşturuldu: ${created.id}`);
      }
    });
  } catch (err) {
    console.error('❌ Seed başarısız:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
