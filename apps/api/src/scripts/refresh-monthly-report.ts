/**
 * Acme Corporation için eski (tenant temizliğinden ÖNCE üretilmiş)
 * ScheduledReport kayıtlarını siler ve GÜNCEL duruma göre (yalnızca
 * Istanbul HQ) taze bir MONTHLY rapor üretir.
 *
 * NEDEN GEREKTİ: cleanup-test-tenants.ts/cleanup-extra-branches.ts ile
 * tenant'ı temizledik, ama ScheduledReport.payload şema-sürümsüz bir JSON
 * blob — eski raporlar (ör. 1 Haziran 2026 tarihli MONTHLY, o zamanki 12
 * şubeyi hâlâ payload'ında taşıyor) geriye dönük güncellenmiyor. Manuel
 * test için güncel/taze bir rapor kaydına ihtiyaç var.
 *
 * ReportsService.generateMonthlyReport tam bir NestJS DI zinciri gerektirmez
 * (yalnızca PrismaService enjekte ediyor) — bu yüzden diğer script'lerdeki
 * gibi tam Nest bootstrap yerine, servis doğrudan bir PrismaClient ile
 * örnekleniyor (create-super-admin.ts / seed-sample-errors.ts ile aynı
 * desen).
 *
 * Kullanım: ts-node src/scripts/refresh-monthly-report.ts
 *   (ya da: pnpm --filter api refresh:monthly-report)
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { withTenantContext } from '../common/utils/tenant-context';
import { ReportsService } from '../modules/reports/reports.service';
import { SecurityEventLogger } from '../common/security-event/security-event.service';

async function main() {
  const prisma = new PrismaClient();
  // ReportsService yalnızca PrismaService'in Prisma Client yüzeyini
  // kullanıyor (ConfigService'e ihtiyacı yok) — script'lerde tam DI
  // bootstrap yerine plain PrismaClient'ı bu tipe cast etmek yeterli.
  // getReport artık assertTenantOwnership için SecurityEventLogger'a da
  // ihtiyaç duyuyor — bu script generateMonthlyReport dışında bir şey
  // çağırmadığı için gerçek bir loglama tetiklenmez, yalnızca DI'yı tatmin eder.
  const securityEvents = new SecurityEventLogger(prisma as unknown as PrismaService);
  const reportsService = new ReportsService(prisma as unknown as PrismaService, securityEvents);

  try {
    const tenant = await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
      const adminUser = await tx.user.findFirst({
        where: { email: 'admin@acme.com', deletedAt: null },
        select: { tenantId: true },
      });
      if (!adminUser) return null;
      return tx.tenant.findUnique({
        where: { id: adminUser.tenantId },
        select: { id: true, companyName: true },
      });
    });

    if (!tenant) {
      console.error('❌ admin@acme.com bulunamadı — hedef tenant belirlenemedi.');
      process.exitCode = 1;
      return;
    }

    console.log(`ℹ️  Hedef tenant: ${tenant.companyName} (${tenant.id})`);

    const deletedCount = await withTenantContext(prisma, { isSuperAdmin: true }, (tx) =>
      tx.scheduledReport.deleteMany({ where: { tenantId: tenant.id } }),
    );
    console.log(`✅ ${deletedCount.count} eski ScheduledReport kaydı silindi (DAILY + MONTHLY).`);

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const fresh = await reportsService.generateMonthlyReport(tenant.id, year, month);
    console.log(`\n✅ Taze MONTHLY rapor üretildi: id=${fresh.id}, period=${(fresh.payload as any).period}`);
    console.log(JSON.stringify(fresh.payload, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ Script hata ile sonlandı:', err);
  process.exitCode = 1;
});
