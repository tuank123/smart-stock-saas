/**
 * SUPER_ADMIN (platform sahibi) kullanıcısı oluşturur.
 *
 * Kullanım:
 *   ts-node src/scripts/create-super-admin.ts <email> <sifre>
 *
 * SUPER_ADMIN de tenant'a bağlı (User.tenantId zorunlu) olduğundan, önce
 * "Platform" adında özel bir tenant (yoksa) oluşturulur, ardından bu tenant
 * altında SUPER_ADMIN kullanıcısı yaratılır. RLS, is_super_admin='true' ile
 * bypass edilir (signup akışıyla aynı desen).
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // fallback, üzerine yazmaz

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { withTenantContext } from '../common/utils/tenant-context';

const PLATFORM_TAX_NUMBER = 'PLATFORM-0000000000';
const PLATFORM_COMPANY_NAME = 'Platform';

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('❌ Kullanım: ts-node src/scripts/create-super-admin.ts <email> <sifre>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ Şifre en az 8 karakter olmalıdır.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const rounds = process.env.BCRYPT_ROUNDS ? parseInt(process.env.BCRYPT_ROUNDS, 10) : 12;
  const passwordHash = await bcrypt.hash(password, rounds);

  try {
    const result = await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
      // Platform tenant'ı (idempotent).
      let platform = await tx.tenant.findUnique({
        where: { taxNumber: PLATFORM_TAX_NUMBER },
        select: { id: true },
      });
      if (!platform) {
        platform = await tx.tenant.create({
          data: {
            companyName: PLATFORM_COMPANY_NAME,
            taxNumber: PLATFORM_TAX_NUMBER,
            planId: 'ENTERPRISE',
            status: 'ACTIVE',
            settings: { platform: true },
          },
          select: { id: true },
        });
      }

      // Aynı e-posta zaten varsa yeniden oluşturma.
      const existingUser = await tx.user.findFirst({
        where: { email, deletedAt: null },
        select: { id: true, role: true },
      });
      if (existingUser) {
        return { created: false, userId: existingUser.id, tenantId: platform.id };
      }

      const user = await tx.user.create({
        data: {
          tenantId: platform.id,
          email,
          fullName: 'Platform Admin',
          passwordHash,
          role: 'SUPER_ADMIN',
          isActive: true,
        },
        select: { id: true },
      });

      return { created: true, userId: user.id, tenantId: platform.id };
    });

    if (result.created) {
      console.log('✅ SUPER_ADMIN oluşturuldu.');
    } else {
      console.log('ℹ️  Bu e-posta ile bir kullanıcı zaten mevcut — yeni kayıt yapılmadı.');
    }
    console.log(`   email     = ${email}`);
    console.log(`   userId    = ${result.userId}`);
    console.log(`   tenantId  = ${result.tenantId} (Platform)`);
  } catch (err) {
    console.error('❌ Oluşturma başarısız:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
