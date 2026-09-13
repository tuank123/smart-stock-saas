/**
 * Veritabanında yalnızca Acme Corporation (gerçek/aktif test tenant'ı) ve
 * Platform (SUPER_ADMIN'in sistem tenant'ı) kalsın diye, GERİ KALAN TÜM
 * tenant'ları (ve tüm bağlı verilerini) siler.
 *
 * NEDEN GEREKTİ: DB'de 266 tenant vardı — 263'ü Playwright test:ui suite'inin
 * her çalıştırmada gerçek POST /tenants/signup ile oluşturup hiç temizlemediği
 * tamamen boş kalıntılar ("E2E Onboarding Ltd...", "E2E Fiyat Ltd..." vb. —
 * ≤1 kullanıcı, ≤1 şube, 0 sipariş/borç/ürün/hareket), biri de ("tek şube")
 * gerçek veri taşıyan ikinci bir manuel test tenant'ıydı. (Playwright
 * suite'inin teardown eksikliği ayrı bir görev olarak ele alınacak, bu
 * script'in kapsamı DEĞİL.)
 *
 * GÜVENLİK KİLİTLERİ:
 * 1. KEEP_TENANT_IDS listesindeki (Acme + Platform) tenant'lar HİÇBİR
 *    KOŞULDA silme listesine giremez (açıkça hariç tutuluyor).
 * 2. Silme listesindeki her tenant TEK TEK kontrol edilir: "tek şube" hariç
 *    (bilerek/onaylanmış gerçek veri), geri kalanların GERÇEKTEN sıfır
 *    sipariş/borç/ürün/stok hareketi içerdiği DOĞRULANIR — herhangi biri
 *    beklenmedik veri taşıyorsa script HİÇBİR ŞEYİ SİLMEDEN durur.
 *
 * FK SIRASI: cleanup-extra-branches.ts'teki desenin AYNISI, ama şube yerine
 * TÜM tenant kapsamında (test/setup.ts:deleteTenantByTaxNumber ile birebir
 * aynı sıra, çoklu tenant için toplu). User/Branch'i elle SİLMİYORUZ —
 * ikisinin de Tenant ilişkisinde onDelete:Cascade var (schema.prisma), bu
 * yüzden diğer TÜM RESTRICT'li çocuk tablolar temizlendikten sonra tek bir
 * `tenant.deleteMany()` User+Branch'i otomatik cascade ile siler. Yalnızca
 * passwordResetToken/emailVerificationToken (User'a cascade YOK) elle
 * temizlenir.
 *
 * Tüm silme işlemi TEK bir transaction içinde.
 *
 * Kullanım: ts-node src/scripts/cleanup-test-tenants.ts
 *   (ya da: pnpm --filter api cleanup:test-tenants)
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { withTenantContext } from '../common/utils/tenant-context';

const KEEP_TENANT_IDS = [
  '290ec168-0ac0-4592-8d3f-163c70ad92cf', // Acme Corporation
  '7d80ea96-2286-43c9-afa2-6c8f54109937', // Platform (SUPER_ADMIN)
];

// Bilerek gerçek veri taşıdığı için silinmesi onaylanan tek istisna —
// diğer tüm silinecek tenant'lar "tamamen boş" varsayımıyla kontrol edilir.
const KNOWN_NON_TRIVIAL_DELETE_ID_HINT = 'tek şube';

async function main() {
  const prisma = new PrismaClient();

  try {
    const result = await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
      const allTenants = await tx.tenant.findMany({
        select: { id: true, companyName: true },
      });

      const toDelete = allTenants.filter((t) => !KEEP_TENANT_IDS.includes(t.id));

      if (toDelete.length === 0) {
        return { deletedCount: 0, skipped: true };
      }

      // ── Güvenlik kilidi: her silinecek tenant'ı TEK TEK doğrula ─────────
      for (const t of toDelete) {
        if (t.companyName === KNOWN_NON_TRIVIAL_DELETE_ID_HINT) continue; // bilerek/onaylı istisna

        const [orders, debts, products, movements] = await Promise.all([
          tx.purchaseOrder.count({ where: { tenantId: t.id } }),
          tx.debt.count({ where: { tenantId: t.id } }),
          tx.product.count({ where: { tenantId: t.id } }),
          tx.stockMovement.count({ where: { tenantId: t.id } }),
        ]);
        if (orders > 0 || debts > 0 || products > 0 || movements > 0) {
          throw new Error(
            `Güvenlik kilidi: "${t.companyName}" (${t.id}) BOŞ değil ` +
              `(orders=${orders} debts=${debts} products=${products} movements=${movements}) — ` +
              `"tamamen boş test tenant'ı" varsayımını ihlal ediyor, script durduruldu.`,
          );
        }
      }

      const ids = toDelete.map((t) => t.id);
      const userIds = (
        await tx.user.findMany({ where: { tenantId: { in: ids } }, select: { id: true } })
      ).map((u) => u.id);

      // ── Çocuktan ebeveyne, FK sırasına göre silme (test/setup.ts ile aynı) ──
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

      // User + Branch: Tenant ilişkisinde onDelete:Cascade var — bu son
      // adım onları otomatik olarak siler.
      await tx.tenant.deleteMany({ where: { id: { in: ids } } });

      return { deletedCount: toDelete.length, skipped: false };
    });

    if (result.skipped) {
      console.log('ℹ️  Silinecek tenant yok.');
      return;
    }

    console.log(`✅ ${result.deletedCount} tenant silindi.`);

    // ── Doğrulama ───────────────────────────────────────────────────────
    const finalCount = await withTenantContext(prisma, { isSuperAdmin: true }, (tx) =>
      tx.tenant.count(),
    );
    const remaining = await withTenantContext(prisma, { isSuperAdmin: true }, (tx) =>
      tx.tenant.findMany({ select: { id: true, companyName: true } }),
    );
    console.log(`\n🔍 Doğrulama — Tenant.count() = ${finalCount}`);
    console.log('Kalan tenant\'lar:', JSON.stringify(remaining, null, 2));

    const expectedIds = new Set(KEEP_TENANT_IDS);
    const actualIds = new Set(remaining.map((r) => r.id));
    const matches =
      finalCount === 2 &&
      expectedIds.size === actualIds.size &&
      [...expectedIds].every((id) => actualIds.has(id));

    if (matches) {
      console.log('✅ Yalnızca Acme Corporation ve Platform kaldı — beklenen sonuç.');
    } else {
      console.error('❌ Beklenmeyen sonuç — kalan tenant listesi KEEP_TENANT_IDS ile eşleşmiyor.');
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ Script hata ile sonlandı:', err);
  process.exitCode = 1;
});
