/**
 * Faz C — arka plan işleri (cron job'lar + sync kuyruğu) için ErrorLog
 * genişletmesi. Bu akışlar HTTP uç noktaları değil (@Cron ile tetiklenir),
 * bu yüzden testler ilgili servisleri doğrudan Nest DI container'ından
 * (app.get(...)) alıp metotlarını çağırıyor.
 *
 * Her senaryo, gerçek bir hatayı DETERMİNİSTİK biçimde tetikler (jest.spyOn
 * ile alt servis metodunu reddet, ya da Prisma middleware ile tek seferlik
 * bir yazım hatası enjekte et — Faz B'deki yarış durumu testleriyle aynı
 * desen) ve ErrorLog'a source uygun kategoriyle, doğru tenantId/context ile
 * yazıldığını doğrular.
 */
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  cleanupTenants,
  signupAndGetContext,
  type SignedUpContext,
} from './setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersScheduler } from '../src/modules/orders/orders.scheduler';
import { OrdersService } from '../src/modules/orders/orders.service';
import { ReportsService } from '../src/modules/reports/reports.service';
import { SyncService } from '../src/modules/sync/sync.service';

describe('Faz C — arka plan işleri ErrorLog genişletmesi (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: SignedUpContext;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx = await signupAndGetContext(app);
    createdTaxNumbers.push(ctx.payload.taxNumber);
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  /**
   * Bu görevdeki tüm yeni yazımlar (SecurityEventLogger ile aynı desende)
   * fire-and-forget: tetikleyen fonksiyon (handleAutoPoCreation vb.) yazımı
   * BEKLEMEDEN döner. Doğrudan servis çağrısıyla tetiklenen testlerde (HTTP
   * round-trip'in doğal gecikmesi olmadığı için) kontrol yazımdan hemen
   * sonra çalışırsa erken/yanlış-negatif sonuç verebilir — kısa bir
   * polling ile gerçek (asenkron) tamamlanmayı bekliyoruz.
   */
  async function waitForErrorLogCount(
    where: { source: string; tenantId: string },
    expectedMinCount: number,
    timeoutMs = 1000,
  ): Promise<number> {
    const start = Date.now();
    for (;;) {
      const count = await prisma.errorLog.count({ where });
      if (count >= expectedMinCount || Date.now() - start > timeoutMs) {
        return count;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  // ── (a) orders.scheduler.ts:handleAutoPoCreation ─────────────────────────

  it('handleAutoPoCreation — tenant bazlı hata artık ErrorLog\'a (source:SCHEDULED_JOB) yazılır', async () => {
    const scheduler = app.get(OrdersScheduler);
    const ordersService = app.get(OrdersService);

    const beforeCount = await prisma.errorLog.count({
      where: { source: 'SCHEDULED_JOB', tenantId: ctx.tenantId },
    });

    const spy = jest
      .spyOn(ordersService, 'checkAndCreateDraftOrders')
      .mockRejectedValue(new Error('E2E simüle hata: eşik kontrolü başarısız'));

    try {
      await scheduler.handleAutoPoCreation();
    } finally {
      spy.mockRestore();
    }

    await waitForErrorLogCount({ source: 'SCHEDULED_JOB', tenantId: ctx.tenantId }, beforeCount + 1);
    const logs = await prisma.errorLog.findMany({
      where: { source: 'SCHEDULED_JOB', tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    expect(logs.length).toBe(beforeCount + 1);
    expect(logs[0].severity).toBe('ERROR');
    expect(logs[0].message).toContain('Otomatik sipariş oluşturma başarısız');
    expect((logs[0].context as { job?: string })?.job).toBe('AutoPoCreation');
  });

  // ── (b) reports.service.ts:generateDailyForAllTenants ────────────────────

  it('generateDailyForAllTenants — tenant bazlı hata artık ErrorLog\'a (source:SCHEDULED_JOB) yazılır', async () => {
    const reportsService = app.get(ReportsService);

    const beforeCount = await prisma.errorLog.count({
      where: { source: 'SCHEDULED_JOB', tenantId: ctx.tenantId },
    });

    const spy = jest
      .spyOn(reportsService, 'generateDailyReport')
      .mockRejectedValue(new Error('E2E simüle hata: günlük rapor sorgusu başarısız'));

    try {
      await reportsService.generateDailyForAllTenants();
    } finally {
      spy.mockRestore();
    }

    await waitForErrorLogCount({ source: 'SCHEDULED_JOB', tenantId: ctx.tenantId }, beforeCount + 1);
    const logs = await prisma.errorLog.findMany({
      where: { source: 'SCHEDULED_JOB', tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    expect(logs.length).toBe(beforeCount + 1);
    expect(logs[0].severity).toBe('ERROR');
    expect(logs[0].message).toContain('Günlük rapor oluşturma başarısız');
    expect((logs[0].context as { job?: string })?.job).toBe('DailyReport');
  });

  // ── (c) reports.service.ts:generateMonthlyForAllTenants ──────────────────

  it('generateMonthlyForAllTenants — tenant bazlı hata artık ErrorLog\'a (source:SCHEDULED_JOB) yazılır', async () => {
    const reportsService = app.get(ReportsService);

    const beforeCount = await prisma.errorLog.count({
      where: { source: 'SCHEDULED_JOB', tenantId: ctx.tenantId },
    });

    const spy = jest
      .spyOn(reportsService, 'generateMonthlyReport')
      .mockRejectedValue(new Error('E2E simüle hata: aylık rapor sorgusu başarısız'));

    try {
      await reportsService.generateMonthlyForAllTenants(2026, 1);
    } finally {
      spy.mockRestore();
    }

    await waitForErrorLogCount({ source: 'SCHEDULED_JOB', tenantId: ctx.tenantId }, beforeCount + 1);
    const logs = await prisma.errorLog.findMany({
      where: { source: 'SCHEDULED_JOB', tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    expect(logs.length).toBe(beforeCount + 1);
    expect(logs[0].severity).toBe('ERROR');
    expect(logs[0].message).toContain('Aylık rapor oluşturma başarısız');
    expect((logs[0].context as { job?: string })?.job).toBe('MonthlyReport');
  });

  // ── (d) sync.service.ts:processQueue — "3 deneme" dışı beklenmeyen hata ──
  //
  // Mevcut "3 denemeden sonra kalıcı FAILED" mekanizması ZATEN ErrorLog'a
  // yazıyordu (source:SYNC_JOB) — burada test edilen, o mekanizmanın DIŞINDA
  // kalan, iş DB'ye yazılırken (syncLog.create) beklenmeyen bir istisna
  // fırlarsa devreye giren dış catch bloğu. Gerçek eşzamanlılık gerektirmediği
  // için Prisma middleware ile TEK SEFERLİK, deterministik bir yazım hatası
  // enjekte ediliyor (Faz B'deki yarış durumu testleriyle aynı desen).

  it('processQueue — "3 deneme" mekanizması DIŞINDaki beklenmeyen bir hata da ErrorLog\'a (source:SYNC_JOB) yazılır', async () => {
    const syncService = app.get(SyncService);

    const queueItem = await syncService.addToQueue({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      operationType: 'STOCK_READ',
      payload: { test: true },
      adapterType: 'E2E_TEST_ADAPTER',
    });

    const beforeCount = await prisma.errorLog.count({
      where: { source: 'SYNC_JOB', tenantId: ctx.tenantId },
    });

    let fired = false;
    const middleware: Parameters<PrismaService['$use']>[0] = async (params, next) => {
      if (!fired && params.model === 'SyncLog' && params.action === 'create') {
        fired = true;
        throw new Error('E2E simüle hata: syncLog yazımı başarısız');
      }
      return next(params);
    };
    prisma.$use(middleware);

    try {
      await syncService.processQueue();

      await waitForErrorLogCount({ source: 'SYNC_JOB', tenantId: ctx.tenantId }, beforeCount + 1);
      const logs = await prisma.errorLog.findMany({
        where: { source: 'SYNC_JOB', tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      expect(logs.length).toBe(beforeCount + 1);
      expect(logs[0].severity).toBe('ERROR');
      expect(logs[0].message).toContain('beklenmeyen hata');
      expect((logs[0].context as { stage?: string; queueId?: string })?.stage).toBe(
        'PROCESS_QUEUE_UNEXPECTED',
      );
      expect((logs[0].context as { queueId?: string })?.queueId).toBe(queueItem.id);

      // Rollback doğrulaması: syncLog.create hatası, onunla AYNI transaction'da
      // olan asıl durum güncellemesini (SUCCESS/FAILED + attemptCount artışı)
      // geri alır. "PROCESSING" işareti ayrı, ÖNCEDEN commit edilmiş bir
      // transaction'da olduğu için kalıcı kalır — ama iş SUCCESS/FAILED'e
      // hiç geçmedi ve attemptCount hiç artmadı, bir sonraki processQueue()
      // turunda tekrar denenebilir durumda.
      const job = await prisma.syncQueue.findUnique({ where: { id: queueItem.id } });
      expect(job?.status).toBe('PROCESSING');
      expect(job?.attemptCount).toBe(0);
    } finally {
      fired = true;
    }
  });
});
