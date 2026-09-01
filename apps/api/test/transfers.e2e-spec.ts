/**
 * Transferler (transfers.controller.ts) — şubeler arası stok transferinin
 * REQUESTED→APPROVED→IN_TRANSIT→DELIVERED akışı ve red akışı.
 *
 * Tüm mutasyon uç noktaları @Roles(SUBE_MUDURU); approve/reject ayrıca
 * transfer.fromBranchId === user.branchId şartını arıyor (bkz.
 * transfers.service.ts). Bu yüzden createRoleUser() ile fromBranch'e bağlı
 * bir SUBE_MUDURU token'ı kullanılıyor. Çok şubeli bir tenant gerektiği için
 * signupAndGetContext() burada businessType='COK_SUBE' (PROFESSIONAL plan)
 * ile çağrılıyor ve ikinci şube PATRON ile POST /branches üzerinden açılıyor.
 */
import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import {
  createTestApp,
  cleanupTenants,
  createCategory,
  createRoleUser,
  signupAndGetContext,
  uniqueSuffix,
  type SignedUpContext,
} from './setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Transferler / Stock Transfers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: SignedUpContext;
  let authHeader: string;
  let subeMuduruAuthHeader: string;
  let fromBranchId: string;
  let toBranchId: string;
  let productId: string;

  const createdTaxNumbers: string[] = [];
  const FROM_INITIAL = 30;
  const TO_INITIAL = 0;
  const TRANSFER_QTY = 10;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx = await signupAndGetContext(app, { businessType: 'COK_SUBE' });
    authHeader = `Bearer ${ctx.accessToken}`;
    createdTaxNumbers.push(ctx.payload.taxNumber);
    fromBranchId = ctx.branchId;

    const branchRes = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', authHeader)
      .send({ name: 'E2E İkinci Şube', slug: `e2e-sube-2-${uniqueSuffix()}` })
      .expect(201);
    toBranchId = branchRes.body.id;

    const subeMuduru = await createRoleUser(app, prisma, {
      tenantId: ctx.tenantId,
      branchId: fromBranchId,
      role: UserRole.SUBE_MUDURU,
    });
    subeMuduruAuthHeader = `Bearer ${subeMuduru.accessToken}`;

    const category = await createCategory(prisma, ctx.tenantId, 'E2E Transfer Kategorisi');

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader)
      .send({
        sku: `E2E-TRF-${uniqueSuffix()}`,
        name: 'E2E Transfer Ürünü',
        unit: 'adet',
        categoryId: category.id,
      })
      .expect(201);
    productId = productRes.body.id;

    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader)
      .send({ branchId: fromBranchId, items: [{ productId, quantity: FROM_INITIAL }] })
      .expect(201);

    // Hedef şubede de kayıt olsun ki GET ile "önce" miktarı 404 almadan okunabilsin.
    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader)
      .send({ branchId: toBranchId, items: [{ productId, quantity: TO_INITIAL }] })
      .expect(201);
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  async function getQuantity(branchId: string): Promise<number> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/stock/${branchId}/${productId}`)
      .set('Authorization', authHeader)
      .expect(200);
    return Number(res.body.quantity);
  }

  // ── (a) Talep oluşturma ──────────────────────────────────────────────────

  let transferId: string;

  it('POST /transfers — REQUESTED statüsüyle 201 döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/transfers')
      .set('Authorization', subeMuduruAuthHeader)
      .send({ fromBranchId, toBranchId, productId, quantity: TRANSFER_QTY })
      .expect(201);

    transferId = res.body.id;
    expect(res.body.status).toBe('REQUESTED');
    expect(Number(res.body.quantity)).toBe(TRANSFER_QTY);
  });

  // ── (b) Onay ──────────────────────────────────────────────────────────────

  it('PATCH /transfers/:id/approve — onay sonrası status APPROVED olur', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${transferId}/approve`)
      .set('Authorization', subeMuduruAuthHeader)
      .expect(200);

    expect(res.body.status).toBe('APPROVED');
    expect(res.body.approvedAt).not.toBeNull();
  });

  // ── (c) Gönderim ──────────────────────────────────────────────────────────

  // dispatch+receive'in tamamını kapsayan bütünlük kontrolü için, gönderim
  // öncesi iki şubenin toplam stoğu burada sabitlenir.
  let totalBeforeDispatch: number;

  it('PATCH /transfers/:id/dispatch — status IN_TRANSIT olur ve gönderen şubenin stoğu HEMEN düşer', async () => {
    const fromBefore = await getQuantity(fromBranchId);
    const toBefore = await getQuantity(toBranchId);
    totalBeforeDispatch = fromBefore + toBefore;

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${transferId}/dispatch`)
      .set('Authorization', subeMuduruAuthHeader)
      .expect(200);

    expect(res.body.status).toBe('IN_TRANSIT');
    // IN_TRANSIT süresince kaynak şubenin ekranı artık eski (fazla) miktarı
    // göstermiyor — mal yola çıktığı an stok düşüyor, receive'i beklemiyor.
    expect(await getQuantity(fromBranchId)).toBe(fromBefore - TRANSFER_QTY);
    // Bu aşamada hedef şubeye henüz hiçbir şey eklenmedi.
    expect(await getQuantity(toBranchId)).toBe(toBefore);
  });

  // ── (d) Teslim alma + bütünlük kontrolü ─────────────────────────────────

  it('PATCH /transfers/:id/receive — status DELIVERED olur, hedef şubenin stoğu artar, kaynak tekrar düşmez', async () => {
    const fromBefore = await getQuantity(fromBranchId);
    const toBefore = await getQuantity(toBranchId);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${transferId}/receive`)
      .set('Authorization', subeMuduruAuthHeader)
      .expect(200);

    expect(res.body.status).toBe('DELIVERED');
    expect(res.body.receivedAt).not.toBeNull();

    const fromAfter = await getQuantity(fromBranchId);
    const toAfter = await getQuantity(toBranchId);
    expect(toAfter).toBe(toBefore + TRANSFER_QTY);
    // Kaynak şube dispatch'te zaten düştü — receive'de tekrar düşmemeli
    // (çifte düşüş olmamalı).
    expect(fromAfter).toBe(fromBefore);

    // Bütünlük kontrolü: dispatch+receive'in tamamı sonunda toplam stok
    // (iki şube toplamı) gönderim öncesiyle aynı — yalnızca şubeler arasında kaydı.
    expect(fromAfter + toAfter).toBe(totalBeforeDispatch);
  });

  // ── (e) Red akışı ─────────────────────────────────────────────────────────

  it('PATCH /transfers/:id/reject — red sonrası status REJECTED olur ve stoğu etkilemez', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/transfers')
      .set('Authorization', subeMuduruAuthHeader)
      .send({ fromBranchId, toBranchId, productId, quantity: 5 })
      .expect(201);
    const rejectTransferId = createRes.body.id;

    const fromBefore = await getQuantity(fromBranchId);
    const toBefore = await getQuantity(toBranchId);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${rejectTransferId}/reject`)
      .set('Authorization', subeMuduruAuthHeader)
      .expect(200);

    expect(res.body.status).toBe('REJECTED');
    expect(await getQuantity(fromBranchId)).toBe(fromBefore);
    expect(await getQuantity(toBranchId)).toBe(toBefore);
  });

  // ── (f) Bütünlük kontrolü — dispatch sırasında konservasyon ihlali ───────
  //
  // stock.e2e-spec.ts'teki yarış durumu testiyle aynı desen: gerçek eşzamanlı
  // HTTP istekleriyle bu yarışı güvenilir biçimde tetiklemek zamanlamaya
  // bağlı (kırılgan) olacağından, Prisma middleware ile TEK SEFERLİK,
  // deterministik bir "eşzamanlı başka bir işlem kaynak şubenin stoğunu
  // zaten düşürdü" senaryosu simüle ediliyor.
  it('PATCH /transfers/:id/dispatch — yarış durumu kaynak şube stoğunu tutarsız bırakırsa 409 döner, DATA_INTEGRITY loglanır, transfer IN_TRANSIT\'e geçmez', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/transfers')
      .set('Authorization', subeMuduruAuthHeader)
      .send({ fromBranchId, toBranchId, productId, quantity: 5 })
      .expect(201);
    const raceTransferId = createRes.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${raceTransferId}/approve`)
      .set('Authorization', subeMuduruAuthHeader)
      .expect(200);

    const beforeErrorCount = await prisma.errorLog.count({
      where: { source: 'DATA_INTEGRITY', tenantId: ctx.tenantId },
    });

    let fired = false;
    const middleware: Parameters<PrismaService['$use']>[0] = async (params, next) => {
      if (
        !fired &&
        params.model === 'StockLevel' &&
        params.action === 'update' &&
        (params.args?.data?.quantity as { decrement?: number } | undefined)?.decrement != null
      ) {
        fired = true;
        // Kaynak şubenin stoğunu, dispatch KENDİ düşüşünü uygulamadan HEMEN
        // önce, başka bir (hayali) eşzamanlı işlem gibi ekstra düşür.
        await prisma.$executeRawUnsafe(
          `UPDATE stock_levels SET quantity = quantity - 1000 WHERE product_id = '${productId}' AND branch_id = '${fromBranchId}'`,
        );
      }
      return next(params);
    };
    prisma.$use(middleware);

    try {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/transfers/${raceTransferId}/dispatch`)
        .set('Authorization', subeMuduruAuthHeader)
        .expect(409);

      expect(res.body.message).toContain('tutarsızlık');

      const errorLogs = await prisma.errorLog.findMany({
        where: { source: 'DATA_INTEGRITY', tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      expect(errorLogs.length).toBe(beforeErrorCount + 1);
      expect(errorLogs[0].message).toContain('kaynak şube stoğu tutarsız');
      expect((errorLogs[0].context as { transferId?: string })?.transferId).toBe(raceTransferId);

      // Rollback doğrulaması: transfer hâlâ APPROVED, IN_TRANSIT'e geçmedi.
      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/transfers/${fromBranchId}`)
        .set('Authorization', subeMuduruAuthHeader)
        .expect(200);
      const raceTransfer = listRes.body.find((t: { id: string }) => t.id === raceTransferId);
      expect(raceTransfer.status).toBe('APPROVED');
    } finally {
      fired = true;
      // Enjekte edilen -1000'i telafi et ki bu suite'teki SONRAKİ hiçbir
      // testi (ve afterAll'daki temizliği) etkilemesin.
      await prisma.$executeRawUnsafe(
        `UPDATE stock_levels SET quantity = quantity + 1000 WHERE product_id = '${productId}' AND branch_id = '${fromBranchId}'`,
      );
    }
  });

  // ── (g) Bütünlük kontrolü — receive sırasında konservasyon ihlali ────────

  it('PATCH /transfers/:id/receive — yarış durumu hedef şube stoğunu tutarsız bırakırsa 409 döner, DATA_INTEGRITY loglanır, transfer DELIVERED\'a geçmez', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/transfers')
      .set('Authorization', subeMuduruAuthHeader)
      .send({ fromBranchId, toBranchId, productId, quantity: 5 })
      .expect(201);
    const raceTransferId = createRes.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${raceTransferId}/approve`)
      .set('Authorization', subeMuduruAuthHeader)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/transfers/${raceTransferId}/dispatch`)
      .set('Authorization', subeMuduruAuthHeader)
      .expect(200);

    const beforeErrorCount = await prisma.errorLog.count({
      where: { source: 'DATA_INTEGRITY', tenantId: ctx.tenantId },
    });

    let fired = false;
    const middleware: Parameters<PrismaService['$use']>[0] = async (params, next) => {
      if (!fired && params.model === 'StockLevel' && params.action === 'upsert') {
        fired = true;
        // Hedef şubenin stoğunu, receive KENDİ artışını uygulamadan HEMEN
        // önce, başka bir (hayali) eşzamanlı işlem gibi ekstra artır.
        await prisma.$executeRawUnsafe(
          `UPDATE stock_levels SET quantity = quantity + 1000 WHERE product_id = '${productId}' AND branch_id = '${toBranchId}'`,
        );
      }
      return next(params);
    };
    prisma.$use(middleware);

    try {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/transfers/${raceTransferId}/receive`)
        .set('Authorization', subeMuduruAuthHeader)
        .expect(409);

      expect(res.body.message).toContain('tutarsızlık');

      const errorLogs = await prisma.errorLog.findMany({
        where: { source: 'DATA_INTEGRITY', tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      expect(errorLogs.length).toBe(beforeErrorCount + 1);
      expect(errorLogs[0].message).toContain('hedef şube stoğu tutarsız');
      expect((errorLogs[0].context as { transferId?: string })?.transferId).toBe(raceTransferId);

      // Rollback doğrulaması: transfer hâlâ IN_TRANSIT, DELIVERED'a geçmedi.
      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/transfers/${fromBranchId}`)
        .set('Authorization', subeMuduruAuthHeader)
        .expect(200);
      const raceTransfer = listRes.body.find((t: { id: string }) => t.id === raceTransferId);
      expect(raceTransfer.status).toBe('IN_TRANSIT');
    } finally {
      fired = true;
      // Enjekte edilen +1000'i telafi et.
      await prisma.$executeRawUnsafe(
        `UPDATE stock_levels SET quantity = quantity - 1000 WHERE product_id = '${productId}' AND branch_id = '${toBranchId}'`,
      );
    }
  });
});
