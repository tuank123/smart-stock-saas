/**
 * Ürün Zayiatları (defective-items.controller.ts) — isletme-app'e özel, yalnızca
 * tek şubeli (STARTER) PATRON'a açık bir akış. Fire (stock.controller.ts:waste,
 * @Roles(SUBE_MUDURU)) ile TAMAMEN AYRI — bu dosya onu test etmiyor.
 *
 * signupAndGetContext() businessType='TEK_SUBE' → STARTER plan → ctx zaten
 * STARTER PATRON döner (bkz. setup.ts) — bu yüzden "izinli" senaryolar için
 * ayrı bir kullanıcı oluşturmaya gerek yok, doğrudan ctx/authHeader kullanılır.
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

const PHOTO_BASE64 = 'data:image/jpeg;base64,ZmFrZS1waG90bw==';

describe('Ürün Zayiatları (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: SignedUpContext;
  let authHeader: string;
  let productId: string;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx = await signupAndGetContext(app);
    authHeader = `Bearer ${ctx.accessToken}`;
    createdTaxNumbers.push(ctx.payload.taxNumber);

    const category = await createCategory(prisma, ctx.tenantId, 'E2E Zayiat Kategorisi');

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader)
      .send({
        sku: `E2E-ZAYIAT-${uniqueSuffix()}`,
        name: 'E2E Zayiat Ürünü',
        unit: 'adet',
        categoryId: category.id,
      })
      .expect(201);
    productId = productRes.body.id;

    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId, items: [{ productId, quantity: 50 }] })
      .expect(201);
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  async function getQuantity(): Promise<number> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/stock/${ctx.branchId}/${productId}`)
      .set('Authorization', authHeader)
      .expect(200);
    return Number(res.body.quantity);
  }

  // ── (a) Oluşturma — stok hemen düşer, kayıt PENDING olur ─────────────────

  it('POST /defective-items/:branchId — kayıt oluşturur, stok hemen düşer, StockMovement DEFECTIVE_OUT ile kaydedilir', async () => {
    const before = await getQuantity();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/defective-items/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .send({ productId, quantity: 3, photoBase64: PHOTO_BASE64 })
      .expect(201);

    expect(res.body.status).toBe('PENDING');
    expect(res.body.quantity).toBe('3');
    expect(res.body.photoBase64).toBe(PHOTO_BASE64);
    expect(await getQuantity()).toBe(before - 3);

    const movement = await prisma.stockMovement.findFirst({
      where: { referenceId: res.body.id, referenceType: 'DEFECTIVE_ITEM_REPORT' },
    });
    expect(movement).toBeDefined();
    expect(movement?.movementType).toBe('DEFECTIVE_OUT');
    expect(Number(movement?.quantity)).toBe(-3);
  });

  it('POST /defective-items/:branchId — mevcut stoktan fazla miktar 400 döner, stoğu değiştirmez', async () => {
    const before = await getQuantity();

    await request(app.getHttpServer())
      .post(`/api/v1/defective-items/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .send({ productId, quantity: before + 1000, photoBase64: PHOTO_BASE64 })
      .expect(400);

    expect(await getQuantity()).toBe(before);
  });

  // ── (b) Bütünlük kontrolü — yarış durumu (post-hoc negatif stok) ─────────
  //
  // stock.e2e-spec.ts'teki "waste — post-hoc kontrol" testiyle AYNI desen:
  // Prisma middleware ile, kendi decrement'imiz uygulanmadan hemen ÖNCE aynı
  // satırı ham SQL ile ekstra düşürüp eşzamanlı başka bir işlemi simüle eder.

  it('POST /defective-items/:branchId — post-hoc kontrol: yarış durumu negatif stoğa yol açarsa 409 döner, DATA_INTEGRITY loglanır, işlem rollback olur', async () => {
    const raceProductRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader)
      .send({
        sku: `E2E-ZAYIAT-RACE-${uniqueSuffix()}`,
        name: 'E2E Zayiat Yarış Durumu Ürünü',
        unit: 'adet',
        categoryId: (await createCategory(prisma, ctx.tenantId, 'E2E Zayiat Yarış Kategorisi')).id,
      })
      .expect(201);
    const raceProductId = raceProductRes.body.id;

    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId, items: [{ productId: raceProductId, quantity: 10 }] })
      .expect(201);

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
        await prisma.$executeRawUnsafe(
          `UPDATE stock_levels SET quantity = quantity - 8 WHERE product_id = '${raceProductId}' AND branch_id = '${ctx.branchId}'`,
        );
      }
      return next(params);
    };
    prisma.$use(middleware);

    try {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/defective-items/${ctx.branchId}`)
        .set('Authorization', authHeader)
        .send({ productId: raceProductId, quantity: 5, photoBase64: PHOTO_BASE64 })
        .expect(409);

      expect(res.body.message).toContain('tutarsızlık');

      const errorLogs = await prisma.errorLog.findMany({
        where: { source: 'DATA_INTEGRITY', tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      expect(errorLogs.length).toBe(beforeErrorCount + 1);
      expect(errorLogs[0].message).toContain('negatife düştü');

      // Rollback doğrulaması: bu isteğin kendi -5 düşüşü geri alınmış, ayrıca
      // hiçbir DefectiveItemReport kalıcı olmamış olmalı.
      const raceQtyRes = await request(app.getHttpServer())
        .get(`/api/v1/stock/${ctx.branchId}/${raceProductId}`)
        .set('Authorization', authHeader)
        .expect(200);
      expect(Number(raceQtyRes.body.quantity)).toBe(2);

      const reports = await prisma.defectiveItemReport.findMany({
        where: { productId: raceProductId },
      });
      expect(reports).toHaveLength(0);
    } finally {
      fired = true;
    }
  });

  // ── (c) Bekleme listesi ───────────────────────────────────────────────────

  let pendingId: string;

  it('GET /defective-items/:branchId — PENDING kayıtları döner', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/defective-items/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .send({ productId, quantity: 2, photoBase64: PHOTO_BASE64 })
      .expect(201);
    pendingId = createRes.body.id;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/defective-items/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(res.body.every((r: { status: string }) => r.status === 'PENDING')).toBe(true);
    expect(res.body.some((r: { id: string }) => r.id === pendingId)).toBe(true);
  });

  // ── (d) Ziyan Oldu — stok tekrar değişmez ─────────────────────────────────

  it('PATCH /defective-items/:id/waste — status WASTED olur, stok TEKRAR değişmez', async () => {
    const before = await getQuantity();

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/defective-items/${pendingId}/waste`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(res.body.status).toBe('WASTED');
    expect(res.body.resolvedAt).toBeDefined();
    expect(await getQuantity()).toBe(before);
  });

  it('PATCH /defective-items/:id/waste — zaten çözümlenmiş kayda tekrar uygulanırsa 400 döner', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/defective-items/${pendingId}/waste`)
      .set('Authorization', authHeader)
      .expect(400);
  });

  // ── (e) Değişim Gerçekleşti — stok GERİ eklenir ───────────────────────────

  it('PATCH /defective-items/:id/exchange — status EXCHANGED olur, stok GERİ eklenir, yeni bir DEFECTIVE_RETURN_IN hareketi oluşur', async () => {
    const createRes = await request(app.getHttpServer())
      .post(`/api/v1/defective-items/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .send({ productId, quantity: 4, photoBase64: PHOTO_BASE64 })
      .expect(201);
    const exchangeId = createRes.body.id;

    const afterCreate = await getQuantity();

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/defective-items/${exchangeId}/exchange`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(res.body.status).toBe('EXCHANGED');
    expect(await getQuantity()).toBe(afterCreate + 4);

    const returnMovement = await prisma.stockMovement.findFirst({
      where: {
        referenceId: exchangeId,
        referenceType: 'DEFECTIVE_ITEM_REPORT',
        movementType: 'DEFECTIVE_RETURN_IN',
      },
    });
    expect(returnMovement).toBeDefined();
    expect(Number(returnMovement?.quantity)).toBe(4);
  });

  // ── (f) Rol kısıtı — yalnızca STARTER PATRON ──────────────────────────────

  it('POST /defective-items/:branchId — SUBE_MUDURU 403 döner', async () => {
    const subeMuduru = await createRoleUser(app, prisma, {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      role: UserRole.SUBE_MUDURU,
    });

    await request(app.getHttpServer())
      .post(`/api/v1/defective-items/${ctx.branchId}`)
      .set('Authorization', `Bearer ${subeMuduru.accessToken}`)
      .send({ productId, quantity: 1, photoBase64: PHOTO_BASE64 })
      .expect(403);
  });

  it('POST /defective-items/:branchId — çok şubeli PATRON (STARTER olmayan plan) 403 döner', async () => {
    const multiPatron = await createRoleUser(app, prisma, {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      role: UserRole.PATRON,
      planId: 'PRO',
    });

    await request(app.getHttpServer())
      .post(`/api/v1/defective-items/${ctx.branchId}`)
      .set('Authorization', `Bearer ${multiPatron.accessToken}`)
      .send({ productId, quantity: 1, photoBase64: PHOTO_BASE64 })
      .expect(403);
  });

  // ── (g) Günlük rapor entegrasyonu ─────────────────────────────────────────
  //
  // (d)'de WASTED'a çevrilen `pendingId` kaydı bugünün raporunda görünmeli;
  // henüz PENDING/EXCHANGED durumundaki kayıtlar görünmemeli.

  it('GET /stock/:branchId/daily-report — yalnızca bugün WASTED olan kayıtlar defectiveItems\'ta görünür', async () => {
    // Hâlâ PENDING kalan bir kayıt (raporda GÖRÜNMEMELİ).
    await request(app.getHttpServer())
      .post(`/api/v1/defective-items/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .send({ productId, quantity: 1, photoBase64: PHOTO_BASE64 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/stock/${ctx.branchId}/daily-report`)
      .set('Authorization', authHeader)
      .expect(200);

    const wastedEntry = res.body.defectiveItems.find(
      (d: { productId: string; quantity: number }) => d.productId === productId,
    );
    expect(wastedEntry).toBeDefined();
    // (d)'de WASTED edilen 2 birim — PENDING/EXCHANGED kayıtlar toplama dahil değil.
    expect(wastedEntry.quantity).toBe(2);
  });
});
