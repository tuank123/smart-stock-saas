/**
 * Bir tenant'ta zaman içinde manuel testlerle biriken FAZLA şubeleri (ve
 * onlara bağlı TÜM verilerini) güvenli şekilde siler — yalnızca KEEP_BRANCH_ID
 * ile belirtilen şube ve ona ait veriler dokunulmadan kalır.
 *
 * NEDEN GEREKTİ: Acme Corporation (STARTER plan, tek şubeli olması gereken)
 * tenant'ı, tekrar tekrar yapılan manuel "yeni şube ekle" testleri yüzünden
 * 12 şubeye çıkmıştı (bkz. görev notları — DB'den doğrudan doğrulandı: 11
 * fazla şubenin HİÇBİRİNDE gerçek kullanıcı yoktu, yalnızca aralarındaki
 * test transferlerinden kalma iz veri vardı). generateMonthlyReport gibi
 * tenant-geneli raporlar bu yüzden yanlışlıkla çok-şubeli görünüyordu.
 *
 * SİLME SIRASI (çocuktan ebeveyne, FK kısıtlarına göre): syncLog → syncQueue,
 * whatsappMessageLog (purchaseOrder'dan ÖNCE — poId FK'si var), debtPayment →
 * debt, purchaseOrderItem → purchaseOrder, stockTransfer (fromBranchId VEYA
 * toBranchId eşleşen — karşı taraf KEEP_BRANCH_ID olsa bile transfer kaydının
 * kendisi silinen şubeye referans verdiği için silinir; bu, kalacak şubenin
 * KENDİ StockMovement/StockLevel'ına DOKUNMAZ), defectiveItemReport,
 * stockMovement, cashierSession, stockLevel, ocrScan, supplierPortalUpload →
 * branchSupplierPortal, branchIntegration, branchSupplier,
 * staffRegistrationToken, agentSetupToken, en son branch'in kendisi.
 *
 * scheduledReport/priceChangeLog.branchId OPSİYONEL alanlar (Branch?) —
 * silinen şubeye işaret edenler DELETE edilmiyor, yalnızca branchId=null
 * yapılıyor (geçmiş rapor/fiyat-değişikliği kaydı, kendi başına hâlâ anlamlı
 * bilgi taşıyor, şube bağlamı kaybolsa bile silinmemeli).
 *
 * GÜVENLİK KİLİDİ: silinecek şubelerden HERHANGİ birine atanmış gerçek bir
 * User varsa script hiçbir şey silmeden durur (bu, "boş/test şubesi" ile
 * "gerçekten kullanılan şube"yi ayırt etmenin en güvenilir yolu).
 *
 * Tüm silme işlemi TEK bir transaction içinde — herhangi bir adım
 * beklenmedik bir FK hatasına çarparsa hiçbir şey kalıcı olmaz.
 *
 * create-super-admin.ts / seed-sample-errors.ts ile aynı desen (dotenv, RLS
 * bypass — withTenantContext(..., {isSuperAdmin:true}, ...), doğrudan
 * PrismaClient, NestJS DI kullanılmıyor).
 *
 * Kullanım: ts-node src/scripts/cleanup-extra-branches.ts
 *   (ya da: pnpm --filter api cleanup:extra-branches)
 *
 * Farklı bir tenant/şube için tekrar kullanmak isterseniz aşağıdaki iki
 * sabiti güncelleyin.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // fallback, üzerine yazmaz

import { PrismaClient } from '@prisma/client';
import { withTenantContext } from '../common/utils/tenant-context';

const TENANT_ID = '290ec168-0ac0-4592-8d3f-163c70ad92cf'; // Acme Corporation
const KEEP_BRANCH_ID = 'e2f1b2a5-54d5-45f4-a758-08ea658399ea'; // Istanbul HQ

async function main() {
  const prisma = new PrismaClient();

  try {
    const result = await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
      const branches = await tx.branch.findMany({
        where: { tenantId: TENANT_ID },
        select: { id: true, name: true },
      });

      if (!branches.some((b) => b.id === KEEP_BRANCH_ID)) {
        throw new Error(
          `KEEP_BRANCH_ID (${KEEP_BRANCH_ID}) bu tenant'a (${TENANT_ID}) ait değil — dur.`,
        );
      }

      const toDelete = branches.filter((b) => b.id !== KEEP_BRANCH_ID).map((b) => b.id);

      if (toDelete.length === 0) {
        return { deletedBranches: [] as { id: string; name: string }[], skipped: true };
      }

      // ── Güvenlik kilidi: silinecek şubelerden birine atanmış gerçek bir
      // kullanıcı varsa DUR — bu, "boş test şubesi" varsayımını ihlal eder.
      const usersOnDeletedBranches = await tx.user.count({
        where: { branchId: { in: toDelete } },
      });
      if (usersOnDeletedBranches > 0) {
        throw new Error(
          `Silinecek şubelerden birine atanmış ${usersOnDeletedBranches} gerçek kullanıcı var — güvenlik için durduruldu. Elle kontrol edin.`,
        );
      }

      const deletedNames = branches.filter((b) => b.id !== KEEP_BRANCH_ID);

      // ── Çocuktan ebeveyne, FK sırasına göre silme ──────────────────────────
      await tx.syncLog.deleteMany({ where: { syncQueue: { branchId: { in: toDelete } } } });
      await tx.syncQueue.deleteMany({ where: { branchId: { in: toDelete } } });

      await tx.whatsappMessageLog.deleteMany({ where: { branchId: { in: toDelete } } });

      await tx.debtPayment.deleteMany({ where: { debt: { branchId: { in: toDelete } } } });
      await tx.debt.deleteMany({ where: { branchId: { in: toDelete } } });
      await tx.supplierLedgerEntry.deleteMany({ where: { branchId: { in: toDelete } } });

      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrder: { branchId: { in: toDelete } } },
      });
      await tx.purchaseOrder.deleteMany({ where: { branchId: { in: toDelete } } });

      await tx.stockTransfer.deleteMany({
        where: { OR: [{ fromBranchId: { in: toDelete } }, { toBranchId: { in: toDelete } }] },
      });

      await tx.defectiveItemReport.deleteMany({ where: { branchId: { in: toDelete } } });
      await tx.stockMovement.deleteMany({ where: { branchId: { in: toDelete } } });
      await tx.cashierSession.deleteMany({ where: { branchId: { in: toDelete } } });
      await tx.stockLevel.deleteMany({ where: { branchId: { in: toDelete } } });
      await tx.ocrScan.deleteMany({ where: { branchId: { in: toDelete } } });

      await tx.supplierPortalUpload.deleteMany({ where: { branchId: { in: toDelete } } });
      await tx.branchSupplierPortal.deleteMany({ where: { branchId: { in: toDelete } } });

      await tx.branchIntegration.deleteMany({ where: { branchId: { in: toDelete } } });
      await tx.branchSupplier.deleteMany({ where: { branchId: { in: toDelete } } });
      await tx.staffRegistrationToken.deleteMany({ where: { branchId: { in: toDelete } } });
      await tx.agentSetupToken.deleteMany({ where: { branchId: { in: toDelete } } });

      // Opsiyonel (Branch?) alanlar — silmek yerine bağlamı temizle.
      await tx.scheduledReport.updateMany({
        where: { branchId: { in: toDelete } },
        data: { branchId: null },
      });
      await tx.priceChangeLog.updateMany({
        where: { branchId: { in: toDelete } },
        data: { branchId: null },
      });

      await tx.branch.deleteMany({ where: { id: { in: toDelete } } });

      return { deletedBranches: deletedNames, skipped: false };
    });

    if (result.skipped) {
      console.log('ℹ️  Silinecek fazla şube yok — tenant zaten tek şubeli.');
      return;
    }

    console.log(`✅ ${result.deletedBranches.length} fazla şube silindi:`);
    for (const b of result.deletedBranches) {
      console.log(`   - ${b.name} (${b.id})`);
    }

    // ── Doğrulama: tenant gerçekten tek şubeli kaldı mı? ──────────────────
    const finalCount = await withTenantContext(prisma, { isSuperAdmin: true }, (tx) =>
      tx.branch.count({ where: { tenantId: TENANT_ID } }),
    );
    console.log(`\n🔍 Doğrulama — Branch.count({ tenantId }) = ${finalCount}`);
    if (finalCount === 1) {
      console.log('✅ Tenant şimdi gerçekten TEK şubeli.');
    } else {
      console.error(`❌ Beklenmeyen sonuç: ${finalCount} şube kaldı (1 bekleniyordu).`);
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
