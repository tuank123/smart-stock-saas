/**
 * Geliştirme veritabanı için başlangıç verisi: "Acme Corporation" tenant'ı +
 * "Istanbul HQ" branch'i + admin@acme.com (PATRON) / manager@acme.com
 * (SUBE_MUDURU) kullanıcıları.
 *
 * İDEMPOTENT ve YIKICI DEĞİL: her varlık önce var mı diye kontrol edilir,
 * yoksa oluşturulur; varsa dokunulmadan atlanır. Eskiden bu dosya en başta
 * `user.deleteMany()/branch.deleteMany()/tenant.deleteMany()` ile TÜM
 * tabloyu siliyordu — bu artık YOK, çünkü bu script'i tekrar çalıştırmak
 * mevcut/gerçek verileri asla bozmamalı.
 *
 * apps/api/src/scripts/create-super-admin.ts ve seed-ui-test-users.ts ile
 * aynı desen (RLS bypass, gerçek bcrypt hash, mevcut UserRole enum değerleri).
 *
 * Kullanım: pnpm --filter database db:seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const TENANT_TAX_NUMBER = 'TR1234567890';
const TENANT_COMPANY_NAME = 'Acme Corporation';
const BRANCH_NAME = 'Istanbul HQ';

// Şifre kuralıyla uyumlu (8+ karakter, 1 büyük harf, 1 rakam) — projenin
// diğer test fixture'larıyla aynı (bkz. apps/api/test/setup.ts signupPayload).
const SEED_PASSWORD = 'Test1234';

const USERS = [
  { email: 'admin@acme.com', role: 'PATRON' as const, fullName: 'Acme Admin' },
  { email: 'manager@acme.com', role: 'SUBE_MUDURU' as const, fullName: 'Acme Manager' },
];

async function main() {
  const prisma = new PrismaClient();
  const rounds = process.env.BCRYPT_ROUNDS ? parseInt(process.env.BCRYPT_ROUNDS, 10) : 12;

  try {
    await prisma.$transaction(async (tx) => {
      // Tenant/branch/user oluşturma için henüz bir tenant bağlamı yok —
      // signup ve diğer script'lerle aynı RLS bypass deseni.
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);

      let tenant = await tx.tenant.findUnique({
        where: { taxNumber: TENANT_TAX_NUMBER },
        select: { id: true },
      });
      if (!tenant) {
        tenant = await tx.tenant.create({
          data: {
            companyName: TENANT_COMPANY_NAME,
            taxNumber: TENANT_TAX_NUMBER,
            planId: 'STARTER',
            status: 'ACTIVE',
            settings: { language: 'tr', currency: 'TRY', dateFormat: 'DD.MM.YYYY' },
          },
          select: { id: true },
        });
        console.log(`✅ Tenant oluşturuldu: ${tenant.id} (${TENANT_COMPANY_NAME})`);
      } else {
        console.log(`ℹ️  Tenant zaten var: ${tenant.id} (${TENANT_COMPANY_NAME}) — atlandı`);
      }

      let branch = await tx.branch.findFirst({
        where: { tenantId: tenant.id },
        select: { id: true },
      });
      if (!branch) {
        branch = await tx.branch.create({
          data: {
            tenantId: tenant.id,
            name: BRANCH_NAME,
            slug: 'istanbul-hq',
            address: 'Beşiktaş, İstanbul',
            phone: '+90 212 123 4567',
            timezone: 'Europe/Istanbul',
            isActive: true,
          },
          select: { id: true },
        });
        console.log(`✅ Branch oluşturuldu: ${branch.id} (${BRANCH_NAME})`);
      } else {
        console.log(`ℹ️  Branch zaten var: ${branch.id} — atlandı`);
      }

      for (const u of USERS) {
        const existing = await tx.user.findFirst({
          where: { email: u.email, deletedAt: null },
          select: { id: true, role: true },
        });
        if (existing) {
          console.log(`ℹ️  ${u.email} zaten var (${existing.role}) — atlandı`);
          continue;
        }

        const passwordHash = await bcrypt.hash(SEED_PASSWORD, rounds);
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

    console.log('\n🎉 Seed tamamlandı (mevcut kayıtlara dokunulmadı).');
    console.log(`   Yeni oluşturulan kullanıcıların şifresi: ${SEED_PASSWORD}`);
    console.log('   (Zaten var olan kullanıcıların şifresi DEĞİŞTİRİLMEDİ.)');
  } catch (err) {
    console.error('❌ Seed başarısız:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
