/**
 * Playwright (apps/web/e2e-ui/*.spec.ts) test koşusu boyunca gerçek
 * POST /tenants/signup ile oluşturulan tenant'ları (ve tüm bağlı verilerini)
 * siler — apps/web/e2e-ui/global-teardown.ts tarafından her test koşusunun
 * SONUNDA otomatik çağrılır. Doğrudan elle de çalıştırılabilir.
 *
 * NEDEN GEREKTİ: Playwright suite'i, Jest API e2e suite'inin aksine
 * (test/setup.ts:cleanupTenants — oluşturulan taxNumber'ları izleyip
 * afterAll'da siler), oluşturduğu tenant'ları HİÇ temizlemiyordu. Zamanla
 * (bkz. cleanup-test-tenants.ts'in geçmişi) 263 boş "E2E ..." tenant'ı
 * birikmişti. Bu script o eksikliği kalıcı olarak kapatır.
 *
 * GÜVENLİK KRİTERİ — ÇİFT şart (yalnızca isim deseni YETERSİZ, tam da bu
 * yüzden 263 tenant birikmişti):
 *   1. companyName "E2E " ile başlıyor (tüm Playwright signup helper'larının
 *      ortak öneki — onboarding-help/web-onboarding-help/feedback-submit/
 *      whatsapp-fiyat-price-discount/reports-monthly-legacy-payload).
 *   2. createdAt >= --since argümanındaki zaman (bu koşunun BAŞLANGICI).
 * İkisi birden sağlanmadan hiçbir tenant silinmez — Acme Corporation/Platform
 * gibi gerçek tenant'lara veya (varsa) eski manuel "E2E..." tenant'larına
 * asla dokunulmaz.
 *
 * Silme sırası cleanup-test-tenants.ts ile BİREBİR AYNI (FK'ya göre çocuktan
 * ebeveyne; User/Branch, Tenant'a onDelete:Cascade olduğu için elle
 * silinmiyor, yalnızca passwordResetToken/emailVerificationToken elle
 * temizleniyor).
 *
 * Kullanım: ts-node src/scripts/cleanup-playwright-tenants.ts --since=<ISO tarih>
 *   (ya da: pnpm --filter api cleanup:playwright-tenants -- --since=<ISO tarih>)
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { withTenantContext } from '../common/utils/tenant-context';

function parseSinceArg(): Date {
  const arg = process.argv.find((a) => a.startsWith('--since='));
  if (!arg) {
    throw new Error('--since=<ISO tarih> argümanı zorunlu (ör. --since=2026-09-14T10:00:00.000Z).');
  }
  const since = new Date(arg.slice('--since='.length));
  if (isNaN(since.getTime())) {
    throw new Error(`Geçersiz --since tarihi: ${arg}`);
  }
  return since;
}

async function main() {
  const since = parseSinceArg();
  const prisma = new PrismaClient();

  try {
    const result = await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
      const candidates = await tx.tenant.findMany({
        where: { companyName: { startsWith: 'E2E ' }, createdAt: { gte: since } },
        select: { id: true, companyName: true },
      });

      if (candidates.length === 0) {
        return { deletedCount: 0 };
      }

      const ids = candidates.map((t) => t.id);
      const userIds = (
        await tx.user.findMany({ where: { tenantId: { in: ids } }, select: { id: true } })
      ).map((u) => u.id);

      // ── Çocuktan ebeveyne (cleanup-test-tenants.ts ile aynı sıra) ────────
      await tx.syncLog.deleteMany({ where: { syncQueue: { tenantId: { in: ids } } } });
      await tx.syncQueue.deleteMany({ where: { tenantId: { in: ids } } });

      await tx.debtPayment.deleteMany({ where: { debt: { tenantId: { in: ids } } } });
      await tx.debt.deleteMany({ where: { tenantId: { in: ids } } });

      await tx.userFeedback.deleteMany({ where: { tenantId: { in: ids } } });
      await tx.scheduledReport.deleteMany({ where: { tenantId: { in: ids } } });
      await tx.whatsappMessageLog.deleteMany({ where: { tenantId: { in: ids } } });

      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrder: { tenantId: { in: ids } } },
      });
      await tx.purchaseOrder.deleteMany({ where: { tenantId: { in: ids } } });

      await tx.stockTransfer.deleteMany({ where: { tenantId: { in: ids } } });

      await tx.supplierPortalUpload.deleteMany({ where: { tenantId: { in: ids } } });
      await tx.branchSupplierPortal.deleteMany({ where: { tenantId: { in: ids } } });

      await tx.branchIntegration.deleteMany({ where: { tenantId: { in: ids } } });
      await tx.agentSetupToken.deleteMany({ where: { tenantId: { in: ids } } });
      await tx.staffRegistrationToken.deleteMany({ where: { tenantId: { in: ids } } });

      await tx.defectiveItemReport.deleteMany({ where: { tenantId: { in: ids } } });
      await tx.stockMovement.deleteMany({ where: { tenantId: { in: ids } } });
      await tx.stockLevel.deleteMany({ where: { tenantId: { in: ids } } });
      await tx.ocrScan.deleteMany({ where: { tenantId: { in: ids } } });
      await tx.cashierSession.deleteMany({ where: { tenantId: { in: ids } } });
      await tx.priceChangeLog.deleteMany({ where: { tenantId: { in: ids } } });

      await tx.branchSupplier.deleteMany({ where: { supplier: { tenantId: { in: ids } } } });
      await tx.product.deleteMany({ where: { tenantId: { in: ids } } });
      await tx.category.deleteMany({ where: { tenantId: { in: ids } } });
      await tx.supplier.deleteMany({ where: { tenantId: { in: ids } } });

      if (userIds.length > 0) {
        await tx.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
        await tx.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } });
      }

      // User + Branch: Tenant ilişkisinde onDelete:Cascade var.
      await tx.tenant.deleteMany({ where: { id: { in: ids } } });

      return { deletedCount: candidates.length };
    });

    console.log(
      `✅ [cleanup-playwright-tenants] ${result.deletedCount} Playwright test tenant'ı silindi (since=${since.toISOString()}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // Bilerek process.exit(1) yapmıyor — bu script CI'da global-teardown
  // tarafından çağrılıyor, temizlik hatası ASIL test sonucunu etkilememeli.
  console.error('⚠️  [cleanup-playwright-tenants] Temizlik başarısız (test sonucunu etkilemez):', err);
});
