/**
 * Istanbul HQ şubesindeki (Acme Corporation) test kullanıcılarını siler —
 * yalnızca admin@acme.com (PATRON) ve manager@acme.com (SUBE_MUDURU) kalsın.
 *
 * NEDEN GEREKTİ: Zaman içinde manuel testlerle bu şubeye 17 fazla kullanıcı
 * eklenmişti (bkz. görev notları — çoğu @test.com domaini, timestamp'li
 * e-posta, hiç isim girilmemiş; ahmet@acme.com/tuan@acme.com'un GERÇEK mi
 * test mi olduğu belirsizdi, kullanıcı tarafından "sil" olarak onaylandı).
 *
 * İKİ AŞAMALI SİLME:
 * 1) GÜVENLİ AŞAMA — kör kör zorlama YOK: Her aday kullanıcı için, User'a
 *    işaret eden HER BİR foreign key ilişkisi (schema.prisma'da grep ile
 *    doğrulanan TAM liste) AYRI AYRI sayılır. Herhangi birinde ≥1 kayıt
 *    varsa o kullanıcı FORCE_DELETE_EMAILS'te AÇIKÇA listelenmediği sürece
 *    ATLANIR (kayıtlar SİLİNMEZ, gerçek işletme verisi olabilir).
 * 2) ZORLA SİLME AŞAMASI (yalnızca FORCE_DELETE_EMAILS'te açıkça onaylanan
 *    kullanıcılar için) — kullanıcının TÜM referans veren kayıtları (hangi
 *    tablo/alan olursa olsun) da birlikte silinir, sonra kullanıcının
 *    kendisi silinir. Bu iki kullanıcı (depo_test@test.com,
 *    depo_yeni_1781550750@test.com) için AÇIKÇA onaylandı: "bu tamamen test
 *    verisi, StockMovement/OcrScan/SyncQueue geçmişi etkilense de önemli
 *    değil" (bkz. görev notları).
 *
 * SyncQueue'nun kendi çocuğu (SyncLog) var — zorla silmede SyncQueue'dan
 * ÖNCE o queue'lara ait SyncLog satırları temizlenir (FK sırası).
 *
 * passwordResetToken/emailVerificationToken "gerçek veri" sayılmaz (yalnızca
 * kimlik doğrulama artığı), her silinen kullanıcı için otomatik temizlenir.
 *
 * Kullanım: ts-node src/scripts/cleanup-test-users.ts
 *   (ya da: pnpm --filter api cleanup:test-users)
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { withTenantContext } from '../common/utils/tenant-context';

const BRANCH_ID = 'e2f1b2a5-54d5-45f4-a758-08ea658399ea'; // Istanbul HQ
const KEEP_EMAILS = ['admin@acme.com', 'manager@acme.com'];

// Açıkça onaylanan, gerçek veriye bağlı olsa bile TÜM verisiyle birlikte
// silinmesi istenen kullanıcılar (bkz. görev notları — bu turda onaylandı).
const FORCE_DELETE_EMAILS = ['depo_test@test.com', 'depo_yeni_1781550750@test.com'];

// User'a işaret eden HER foreign key ilişkisi (schema.prisma'da grep ile
// doğrulandı) — her biri için hem SAYMA hem SİLME fonksiyonu.
function userReferenceOps(tx: any, userId: string) {
  return [
    ['StockMovement.createdBy', () => tx.stockMovement.count({ where: { createdBy: userId } }), () => tx.stockMovement.deleteMany({ where: { createdBy: userId } })],
    ['CashierSession.openedBy', () => tx.cashierSession.count({ where: { openedBy: userId } }), () => tx.cashierSession.deleteMany({ where: { openedBy: userId } })],
    ['Debt.createdBy', () => tx.debt.count({ where: { createdBy: userId } }), () => tx.debt.deleteMany({ where: { createdBy: userId } })],
    ['DebtPayment.createdBy', () => tx.debtPayment.count({ where: { createdBy: userId } }), () => tx.debtPayment.deleteMany({ where: { createdBy: userId } })],
    ['DefectiveItemReport.createdBy', () => tx.defectiveItemReport.count({ where: { createdBy: userId } }), () => tx.defectiveItemReport.deleteMany({ where: { createdBy: userId } })],
    ['DefectiveItemReport.resolvedBy', () => tx.defectiveItemReport.count({ where: { resolvedBy: userId } }), () => tx.defectiveItemReport.updateMany({ where: { resolvedBy: userId }, data: { resolvedBy: null } })],
    ['PurchaseOrder.approvedBy', () => tx.purchaseOrder.count({ where: { approvedBy: userId } }), () => tx.purchaseOrder.updateMany({ where: { approvedBy: userId }, data: { approvedBy: null } })],
    ['StockTransfer.requestedBy', () => tx.stockTransfer.count({ where: { requestedBy: userId } }), () => tx.stockTransfer.deleteMany({ where: { requestedBy: userId } })],
    ['StockTransfer.approvedBy', () => tx.stockTransfer.count({ where: { approvedBy: userId } }), () => tx.stockTransfer.updateMany({ where: { approvedBy: userId }, data: { approvedBy: null } })],
    ['StockTransfer.dispatchedBy', () => tx.stockTransfer.count({ where: { dispatchedBy: userId } }), () => tx.stockTransfer.updateMany({ where: { dispatchedBy: userId }, data: { dispatchedBy: null } })],
    ['StockTransfer.receivedBy', () => tx.stockTransfer.count({ where: { receivedBy: userId } }), () => tx.stockTransfer.updateMany({ where: { receivedBy: userId }, data: { receivedBy: null } })],
    ['OcrScan.scannedBy', () => tx.ocrScan.count({ where: { scannedBy: userId } }), () => tx.ocrScan.deleteMany({ where: { scannedBy: userId } })],
    ['OcrScan.confirmedBy', () => tx.ocrScan.count({ where: { confirmedBy: userId } }), () => tx.ocrScan.updateMany({ where: { confirmedBy: userId }, data: { confirmedBy: null } })],
    [
      'SyncQueue.createdBy',
      () => tx.syncQueue.count({ where: { createdBy: userId } }),
      async () => {
        const queues = await tx.syncQueue.findMany({ where: { createdBy: userId }, select: { id: true } });
        const queueIds = queues.map((q: { id: string }) => q.id);
        if (queueIds.length > 0) {
          await tx.syncLog.deleteMany({ where: { queueId: { in: queueIds } } });
        }
        await tx.syncQueue.deleteMany({ where: { createdBy: userId } });
      },
    ],
    ['SupplierPortalUpload.reviewedBy', () => tx.supplierPortalUpload.count({ where: { reviewedBy: userId } }), () => tx.supplierPortalUpload.updateMany({ where: { reviewedBy: userId }, data: { reviewedBy: null } })],
    ['PriceChangeLog.changedBy', () => tx.priceChangeLog.count({ where: { changedBy: userId } }), () => tx.priceChangeLog.deleteMany({ where: { changedBy: userId } })],
    ['UserFeedback.userId', () => tx.userFeedback.count({ where: { userId } }), () => tx.userFeedback.deleteMany({ where: { userId } })],
  ] as const;
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const outcome = await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
      const candidates = await tx.user.findMany({
        where: { branchId: BRANCH_ID, email: { notIn: KEEP_EMAILS } },
        select: { id: true, email: true },
        orderBy: { createdAt: 'asc' },
      });

      const deletedSafe: string[] = [];
      const deletedForced: { email: string; wiped: string[] }[] = [];
      const skipped: { email: string; blockers: string[] }[] = [];

      for (const u of candidates) {
        const ops = userReferenceOps(tx, u.id);
        const blockers: string[] = [];
        for (const [label, count] of ops) {
          const n = await count();
          if (n > 0) blockers.push(`${label} (${n})`);
        }

        if (blockers.length === 0) {
          // Güvenli — hiçbir gerçek veriye bağlı değil.
          await tx.passwordResetToken.deleteMany({ where: { userId: u.id } });
          await tx.emailVerificationToken.deleteMany({ where: { userId: u.id } });
          await tx.user.delete({ where: { id: u.id } });
          deletedSafe.push(u.email);
        } else if (FORCE_DELETE_EMAILS.includes(u.email)) {
          // Açıkça onaylanmış zorla silme — TÜM referans veren kayıtları da sil.
          for (const [, , wipe] of ops) {
            await wipe();
          }
          await tx.passwordResetToken.deleteMany({ where: { userId: u.id } });
          await tx.emailVerificationToken.deleteMany({ where: { userId: u.id } });
          await tx.user.delete({ where: { id: u.id } });
          deletedForced.push({ email: u.email, wiped: blockers });
        } else {
          skipped.push({ email: u.email, blockers });
        }
      }

      return { deletedSafe, deletedForced, skipped };
    });

    console.log(`✅ Güvenli silinen kullanıcı sayısı: ${outcome.deletedSafe.length}`);
    for (const email of outcome.deletedSafe) console.log(`   - ${email}`);

    console.log(`\n⚠️  Zorla silinen kullanıcı sayısı (veri de silindi): ${outcome.deletedForced.length}`);
    for (const d of outcome.deletedForced) {
      console.log(`   - ${d.email}: silinen/temizlenen veri → ${d.wiped.join(', ')}`);
    }

    console.log(`\n⏭️  Atlanan (gerçek veriye bağlı, onaylanmamış) kullanıcı sayısı: ${outcome.skipped.length}`);
    for (const s of outcome.skipped) console.log(`   - ${s.email}: ${s.blockers.join(', ')}`);

    // ── Doğrulama ───────────────────────────────────────────────────────
    const finalCount = await withTenantContext(prisma, { isSuperAdmin: true }, (tx) =>
      tx.user.count({ where: { branchId: BRANCH_ID } }),
    );
    const remaining = await withTenantContext(prisma, { isSuperAdmin: true }, (tx) =>
      tx.user.findMany({ where: { branchId: BRANCH_ID }, select: { email: true, role: true } }),
    );
    console.log(`\n🔍 Doğrulama — User.count({ branchId }) = ${finalCount}`);
    console.log('Kalan kullanıcılar:', JSON.stringify(remaining, null, 2));

    if (finalCount === 2 && remaining.every((r) => KEEP_EMAILS.includes(r.email))) {
      console.log('✅ Yalnızca admin@acme.com ve manager@acme.com kaldı — beklenen sonuç.');
    } else if (outcome.skipped.length > 0) {
      console.log(
        'ℹ️  2\'den fazla kullanıcı kaldı çünkü bazıları gerçek veriye bağlı olduğu için (ve FORCE_DELETE_EMAILS\'te onaylanmadığı için) ATLANDI — bu beklenen/güvenli bir durum, hata değil.',
      );
    } else {
      console.error('❌ Beklenmeyen sonuç.');
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
