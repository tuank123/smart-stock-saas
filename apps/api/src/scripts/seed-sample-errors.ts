/**
 * Admin panelindeki "Hatalar & Uyarılar" (ErrorLog) ekranını manuel/görsel
 * olarak test edebilmek için, mevcut bir tenant'a Faz A+B+C'de eklediğimiz
 * TÜM kategorilerden birer örnek kayıt ekler.
 *
 * BU BİR SEED DEĞİL — idempotent DEĞİLDİR, her çalıştırmada 14 YENİ kayıt
 * ekler (bilerek; bir kerelik manuel test verisi, create-super-admin.ts'nin
 * aksine "zaten var mı" kontrolü yapılmaz).
 *
 * Hedef tenant otomatik bulunur: önce admin@acme.com kullanıcısının tenant'ı
 * (packages/database/prisma/seed.ts VEYA seed-ui-test-users.ts ile
 * oluşturulmuş olabilir — hangisi varsa o), yoksa ilk ACTIVE tenant, hiçbiri
 * yoksa script açık bir hatayla durur.
 *
 * create-super-admin.ts / seed-ui-test-users.ts ile aynı desen (dotenv, RLS
 * bypass, doğrudan PrismaClient — NestJS DI kullanılmıyor, bu yüzden
 * SecurityEventLogger/DataIntegrityException gibi servis sınıfları yerine
 * onların ÜRETTİĞİ ErrorLog şekli elle birebir kopyalanıyor).
 *
 * Kullanım: ts-node src/scripts/seed-sample-errors.ts
 *   (ya da: pnpm --filter api seed:sample-errors)
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // fallback, üzerine yazmaz

import { randomUUID } from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { withTenantContext } from '../common/utils/tenant-context';

const MIN_AGO = (m: number) => new Date(Date.now() - m * 60_000);

async function main() {
  const prisma = new PrismaClient();

  try {
    const { tenant, branch } = await withTenantContext(
      prisma,
      { isSuperAdmin: true },
      async (tx) => {
        // 1) Tercihen admin@acme.com'un tenant'ı (hangi seed script'i
        // çalıştırılmışsa — packages/database/prisma/seed.ts ya da
        // seed-ui-test-users.ts — o tenant bulunur).
        const adminUser = await tx.user.findFirst({
          where: { email: 'admin@acme.com', deletedAt: null },
          select: { tenantId: true, branchId: true },
        });

        if (adminUser) {
          const t = await tx.tenant.findUnique({
            where: { id: adminUser.tenantId },
            select: { id: true, companyName: true },
          });
          const b = adminUser.branchId
            ? await tx.branch.findUnique({
                where: { id: adminUser.branchId },
                select: { id: true, name: true },
              })
            : null;
          if (t) return { tenant: t, branch: b };
        }

        // 2) Fallback: ilk ACTIVE tenant + onun ilk şubesi.
        const anyTenant = await tx.tenant.findFirst({
          where: { status: 'ACTIVE', deletedAt: null },
          select: { id: true, companyName: true },
          orderBy: { createdAt: 'asc' },
        });
        if (!anyTenant) return { tenant: null, branch: null };

        const anyBranch = await tx.branch.findFirst({
          where: { tenantId: anyTenant.id },
          select: { id: true, name: true },
        });
        return { tenant: anyTenant, branch: anyBranch };
      },
    );

    if (!tenant) {
      console.error(
        '❌ Veritabanında hiç tenant bulunamadı. Önce bir tenant oluşturun ' +
          '(ör. pnpm --filter database db:seed ya da bir signup akışı), sonra tekrar deneyin.',
      );
      process.exitCode = 1;
      return;
    }

    console.log(`ℹ️  Hedef tenant: ${tenant.companyName} (${tenant.id})`);
    if (branch) console.log(`ℹ️  Hedef şube: ${branch.name} (${branch.id})`);
    else console.log('⚠️  Bu tenant için şube bulunamadı — branchId gerektiren kayıtlarda null kullanılacak.');

    const tenantId = tenant.id;
    const branchId = branch?.id ?? null;

    // Gerçekçi ama sahte kaynak kimlikleri (context'te referans olarak kullanılır).
    const fakeUserId = randomUUID();
    const fakeProductId = randomUUID();
    const fakeStockLevelId = randomUUID();
    const fakeOrderId = randomUUID();
    const fakeOrderItemId = randomUUID();
    const fakeTransferId = randomUUID();
    const fakeScanId = randomUUID();
    const fakeQueueId = randomUUID();
    const fakeAgentId = randomUUID();

    type SeedRow = Prisma.ErrorLogCreateManyInput;

    const rows: SeedRow[] = [
      // ── 1-8: SECURITY_EVENT (Faz A) ──────────────────────────────────────
      {
        source: 'SECURITY_EVENT',
        severity: 'WARNING',
        message: 'Başarısız giriş denemesi (yanlış şifre)',
        tenantId,
        context: {
          eventType: 'LOGIN_FAILED',
          ip: '192.168.1.100',
          email: 'muhasebe@acme-tedarik.com',
          userId: fakeUserId,
          path: '/api/v1/auth/login',
        },
        createdAt: MIN_AGO(180),
      },
      {
        source: 'SECURITY_EVENT',
        severity: 'WARNING',
        message: 'Geçersiz veya süresi dolmuş erişim token\'ı',
        context: {
          eventType: 'JWT_REJECTED',
          ip: '85.34.12.9',
          email: null,
          userId: null,
          path: `/api/v1/orders/${branchId ?? fakeOrderId}`,
        },
        createdAt: MIN_AGO(165),
      },
      {
        source: 'SECURITY_EVENT',
        severity: 'WARNING',
        message: 'Yetkisiz rol ile erişim denemesi (gerekli: SUBE_MUDURU, mevcut: KASIYER)',
        tenantId,
        context: {
          eventType: 'FORBIDDEN_ROLE',
          ip: '192.168.1.55',
          email: null,
          userId: fakeUserId,
          path: '/api/v1/orders',
          requiredRoles: ['SUBE_MUDURU'],
          actualRole: 'KASIYER',
        },
        createdAt: MIN_AGO(150),
      },
      {
        source: 'SECURITY_EVENT',
        severity: 'WARNING',
        message: 'Agent API anahtarı eşleşmedi',
        tenantId,
        branchId,
        context: {
          eventType: 'INVALID_AGENT_KEY',
          ip: '203.0.113.44',
          email: null,
          userId: null,
          path: '/api/v1/agent/sync-queue',
          agentId: fakeAgentId,
        },
        createdAt: MIN_AGO(135),
      },
      {
        source: 'SECURITY_EVENT',
        severity: 'WARNING',
        message: 'İmza doğrulaması başarısız (uyuşmayan/geçersiz imza)',
        context: {
          eventType: 'WHATSAPP_SIGNATURE_INVALID',
          ip: '157.240.22.35',
          email: null,
          userId: null,
          path: '/api/v1/whatsapp/webhook',
        },
        createdAt: MIN_AGO(120),
      },
      {
        source: 'SECURITY_EVENT',
        severity: 'WARNING',
        message: 'Rate limit aşıldı: POST /api/v1/auth/login',
        context: {
          eventType: 'RATE_LIMITED',
          ip: '192.168.1.100',
          email: null,
          userId: null,
          path: '/api/v1/auth/login',
          method: 'POST',
          totalHits: 6,
        },
        createdAt: MIN_AGO(105),
      },
      {
        source: 'SECURITY_EVENT',
        severity: 'WARNING',
        message: 'Başka bir tenant\'a ait PurchaseOrder kaynağına erişim denemesi',
        tenantId,
        context: {
          eventType: 'CROSS_TENANT_ACCESS_ATTEMPT',
          email: null,
          userId: fakeUserId,
          path: null,
          resourceType: 'PurchaseOrder',
          resourceId: fakeOrderId,
        },
        createdAt: MIN_AGO(90),
      },
      {
        source: 'SECURITY_EVENT',
        // Diğer güvenlik olaylarından (WARNING) görsel olarak ayrışsın diye
        // BİLEREK CRITICAL — bir güvenlik KONTROLÜNÜN (rate-limit/blacklist)
        // sessizce devre dışı kaldığı, en yüksek öncelikli senaryo.
        severity: 'CRITICAL',
        message:
          'Redis bağlantısı kurulamadı — login rate-limit ve refresh-token blacklist kontrolleri devre dışı',
        context: {
          eventType: 'REDIS_CONNECTION_FAILED',
          error: 'connect ECONNREFUSED 127.0.0.1:6379',
        },
        createdAt: MIN_AGO(5),
      },

      // ── 9-11: DATA_INTEGRITY (Faz B) ─────────────────────────────────────
      {
        source: 'DATA_INTEGRITY',
        severity: 'ERROR',
        message: 'Fire kaydı sonrası stok negatife düştü',
        tenantId,
        branchId,
        context: {
          productId: fakeProductId,
          wasteQuantity: 15,
          stockLevelId: fakeStockLevelId,
          quantityAfter: -3,
        },
        createdAt: MIN_AGO(80),
      },
      {
        source: 'DATA_INTEGRITY',
        severity: 'ERROR',
        message: 'Transfer dispatch sonrası kaynak şube stoğu tutarsız',
        tenantId,
        branchId,
        context: {
          transferId: fakeTransferId,
          productId: fakeProductId,
          transferQuantity: 20,
          quantityBefore: 50,
          expectedAfter: 30,
          actualAfter: 18,
        },
        createdAt: MIN_AGO(60),
      },
      {
        source: 'DATA_INTEGRITY',
        severity: 'ERROR',
        message: 'OCR fatura onayı: ödenen tutar fatura tutarını aşıyor',
        tenantId,
        branchId,
        context: {
          scanId: fakeScanId,
          invoiceTotal: 1000,
          paidAmount: 1500,
        },
        createdAt: MIN_AGO(45),
      },

      // ── 12-14: SCHEDULED_JOB / SYNC_JOB (Faz C) ──────────────────────────
      {
        source: 'SCHEDULED_JOB',
        severity: 'ERROR',
        message: `Otomatik sipariş oluşturma başarısız: ${tenant.companyName}`,
        tenantId,
        context: {
          job: 'AutoPoCreation',
          tenantId,
          error: `Birincil tedarikçi yok — branch=${branchId ?? 'bilinmiyor'} product=${fakeProductId}`,
        },
        createdAt: MIN_AGO(30),
      },
      {
        source: 'SCHEDULED_JOB',
        severity: 'ERROR',
        message: `Günlük rapor oluşturma başarısız: tenant=${tenantId}`,
        tenantId,
        context: {
          job: 'DailyReport',
          tenantId,
          error: 'Connection terminated unexpectedly',
        },
        createdAt: MIN_AGO(20),
      },
      {
        source: 'SYNC_JOB',
        severity: 'ERROR',
        message: 'Sync job işlenirken beklenmeyen hata: syncLog yazımı başarısız',
        tenantId,
        branchId,
        context: {
          stage: 'PROCESS_QUEUE_UNEXPECTED',
          queueId: fakeQueueId,
          adapterType: 'DIGIFORM',
          operationType: 'STOCK_READ',
        },
        // orderItemId — yalnızca receiveOrder'daki DATA_INTEGRITY kaydının
        // gerçek şeklini hatırlatmak için (bu kayıtta kullanılmıyor, kasıtlı).
        createdAt: MIN_AGO(10),
      },
    ];
    void fakeOrderItemId;

    const result = await prisma.errorLog.createMany({ data: rows });
    console.log(`✅ ${result.count} örnek ErrorLog kaydı eklendi.`);
    console.log('   Kategoriler: SECURITY_EVENT (8, biri CRITICAL) + DATA_INTEGRITY (3) + SCHEDULED_JOB (2) + SYNC_JOB (1)');
  } catch (err) {
    console.error('❌ Örnek veri ekleme başarısız:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
