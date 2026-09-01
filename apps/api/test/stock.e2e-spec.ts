/**
 * Stok (stock.controller.ts) — gecici-kasa.e2e-spec.ts'in kapsamadığı uç
 * noktalar: initialize, sale (kasa oturumu olmadan), waste, threshold ve
 * daily-report. Kasa oturumu açma/kapama ve fiş listesi zaten
 * gecici-kasa.e2e-spec.ts'te test edildiği için burada tekrarlanmıyor.
 *
 * waste/threshold @Roles(SUBE_MUDURU) — signupAndGetContext() PATRON döner,
 * bu yüzden bu ikisi için createRoleUser() ile ayrı bir SUBE_MUDURU token'ı
 * kullanılıyor (bkz. setup.ts).
 */
import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import {
  createTestApp,
  cleanupTenants,
  createCategory,
  createRoleUser,
  setProductSalePrice,
  signupAndGetContext,
  uniqueSuffix,
  type SignedUpContext,
} from './setup';
import { PrismaService } from '../src/prisma/prisma.service';

const SALE_PRICE = 12.75;
const INITIAL_QUANTITY = 100;

describe('Stok (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: SignedUpContext;
  let authHeader: string;
  let subeMuduruAuthHeader: string;
  let productId: string;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx = await signupAndGetContext(app);
    authHeader = `Bearer ${ctx.accessToken}`;
    createdTaxNumbers.push(ctx.payload.taxNumber);

    const subeMuduru = await createRoleUser(app, prisma, {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      role: UserRole.SUBE_MUDURU,
    });
    subeMuduruAuthHeader = `Bearer ${subeMuduru.accessToken}`;

    const category = await createCategory(prisma, ctx.tenantId, 'E2E Stok Kategorisi');

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader)
      .send({
        sku: `E2E-STOK-${uniqueSuffix()}`,
        name: 'E2E Stok Ürünü',
        unit: 'adet',
        categoryId: category.id,
      })
      .expect(201);
    productId = productRes.body.id;

    await setProductSalePrice(prisma, productId, SALE_PRICE);
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

  // ── (a) Başlangıç stoğu ────────────────────────────────────────────────────

  it('POST /stock/initialize — StockLevel doğru miktar ve minThreshold ile oluşur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId, items: [{ productId, quantity: INITIAL_QUANTITY }] })
      .expect(201);

    expect(res.body).toHaveLength(1);
    expect(Number(res.body[0].quantity)).toBe(INITIAL_QUANTITY);
    // minThreshold = max(1, floor(quantity * 0.2))
    expect(Number(res.body[0].minThreshold)).toBe(20);

    expect(await getQuantity()).toBe(INITIAL_QUANTITY);
  });

  it('POST /stock/initialize — aynı ürün/şube için tekrar çağrılırsa 409 döner', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId, items: [{ productId, quantity: 5 }] })
      .expect(409);

    // Reddedilen ikinci initialize orijinal miktarı bozmamalı.
    expect(await getQuantity()).toBe(INITIAL_QUANTITY);
  });

  // ── (b) Satış (kasa oturumu olmadan) ────────────────────────────────────────

  it('POST /stock/:branchId/sale — cashierSessionId olmadan satış stok seviyesini doğru düşürür', async () => {
    const before = await getQuantity();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/stock/${ctx.branchId}/sale`)
      .set('Authorization', authHeader)
      .send({
        items: [{ productId, quantity: 8 }],
        paymentMethod: 'CARD',
      })
      .expect(201);

    expect(res.body.totalAmount).toBeCloseTo(8 * SALE_PRICE, 2);
    expect(res.body.paymentMethod).toBe('CARD');
    expect(await getQuantity()).toBe(before - 8);
  });

  it('POST /stock/:branchId/sale — mevcut stoktan fazla miktar 400 döner ve stoğu değiştirmez', async () => {
    const before = await getQuantity();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/stock/${ctx.branchId}/sale`)
      .set('Authorization', authHeader)
      .send({
        items: [{ productId, quantity: before + 500 }],
        paymentMethod: 'CASH',
      })
      .expect(400);

    expect(res.body.message).toContain('yetersiz stok');
    expect(await getQuantity()).toBe(before);
  });

  // ── (c) Fire / zayiat ────────────────────────────────────────────────────

  it('POST /stock/:branchId/waste — fire girildiğinde stok miktarı doğru azalır', async () => {
    const before = await getQuantity();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/stock/${ctx.branchId}/waste`)
      .set('Authorization', subeMuduruAuthHeader)
      .send({
        productId,
        quantity: 3,
        reason: 'Son kullanma tarihi geçti',
        photoBase64: 'data:image/jpeg;base64,ZmFrZS1waG90bw==',
      })
      .expect(201);

    expect(Number(res.body.quantity)).toBe(-3);
    expect(res.body.movementType).toBe('WASTE');
    expect(await getQuantity()).toBe(before - 3);
  });

  it('POST /stock/:branchId/waste — mevcut stoktan fazla fire 400 döner ve stoğu negatife düşürmez', async () => {
    const before = await getQuantity();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/stock/${ctx.branchId}/waste`)
      .set('Authorization', subeMuduruAuthHeader)
      .send({
        productId,
        quantity: before + 500,
        reason: 'Fazla fire testi',
        photoBase64: 'data:image/jpeg;base64,ZmFrZS1waG90bw==',
      })
      .expect(400);

    expect(await getQuantity()).toBe(before);
  });

  // ── (c-2) Bütünlük kontrolü — yarış durumu (post-hoc negatif stok) ───────
  //
  // Yukarıdaki (400) kontrolü YALNIZCA istek ANINDA okunan miktara bakıyor —
  // iki eşzamanlı fire kaydı aynı başlangıç miktarını okuyup ikisi de ön-
  // kontrolü geçebilir. Gerçek eşzamanlılığı HTTP seviyesinde güvenilir
  // biçimde tetiklemek zamanlamaya bağlı (kırılgan) olacağından, Prisma
  // middleware ile TEK SEFERLİK, deterministik bir "eşzamanlı başka bir
  // işlem stoğu zaten düşürdü" senaryosu simüle ediliyor: recordWaste kendi
  // decrement'ini uygularken, ARADA ham SQL ile stoğu ekstra düşürüyoruz —
  // sonuç negatife düşüyor ve post-hoc kontrol (düşüşten SONRA yeniden okuma)
  // bunu yakalamalı.
  it('POST /stock/:branchId/waste — post-hoc kontrol: yarış durumu negatif stoğa yol açarsa 409 döner, DATA_INTEGRITY loglanır, işlem rollback olur', async () => {
    const raceProductRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader)
      .send({
        sku: `E2E-STOK-RACE-${uniqueSuffix()}`,
        name: 'E2E Yarış Durumu Ürünü',
        unit: 'adet',
        categoryId: (await createCategory(prisma, ctx.tenantId, 'E2E Yarış Kategorisi')).id,
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

    // Tek seferlik middleware: recordWaste'in KENDİ decrement'i uygulanmadan
    // hemen ÖNCE, aynı satırı ham SQL ile 8 birim daha düşür (başka bir
    // eşzamanlı işlemi simüle eder). Ardından kendini devre dışı bırakır.
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
      // Ön-kontrolü geçer (5 <= 10), ama araya giren -8 yüzünden gerçek
      // sonuç 10 - 8 - 5 = -3 olur.
      const res = await request(app.getHttpServer())
        .post(`/api/v1/stock/${ctx.branchId}/waste`)
        .set('Authorization', subeMuduruAuthHeader)
        .send({
          productId: raceProductId,
          quantity: 5,
          reason: 'Yarış durumu testi',
          photoBase64: 'data:image/jpeg;base64,ZmFrZS1waG90bw==',
        })
        .expect(409);

      expect(res.body.message).toContain('tutarsızlık');

      const errorLogs = await prisma.errorLog.findMany({
        where: { source: 'DATA_INTEGRITY', tenantId: ctx.tenantId },
        orderBy: { createdAt: 'desc' },
      });
      expect(errorLogs.length).toBe(beforeErrorCount + 1);
      expect(errorLogs[0].message).toContain('negatife düştü');
      expect((errorLogs[0].context as { productId?: string })?.productId).toBe(raceProductId);

      // Rollback doğrulaması: BU isteğin kendi -5 düşüşü geri alınmış olmalı
      // (recordWaste transaction'ı DataIntegrityException ile rollback eder).
      // Enjekte edilen -8 ise BAŞKA (hayali) bir transaction'a ait olduğu
      // için (prisma üzerinden, tx dışında, otomatik commit) kalıcıdır —
      // gerçek bir eşzamanlı işlemi doğru şekilde simüle eder: 10 - 8 = 2.
      const raceQtyRes = await request(app.getHttpServer())
        .get(`/api/v1/stock/${ctx.branchId}/${raceProductId}`)
        .set('Authorization', authHeader)
        .expect(200);
      expect(Number(raceQtyRes.body.quantity)).toBe(2);
    } finally {
      fired = true; // güvenlik: middleware artık hiçbir şeye müdahale etmesin
    }
  });

  // ── (d) Kritik eşik güncelleme ───────────────────────────────────────────

  it('PATCH /stock/:branchId/:productId/threshold — yeni eşik değerleri doğru kaydedilir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/stock/${ctx.branchId}/${productId}/threshold`)
      .set('Authorization', subeMuduruAuthHeader)
      .send({ minThreshold: 15, maxThreshold: 200 })
      .expect(200);

    expect(Number(res.body.minThreshold)).toBe(15);
    expect(Number(res.body.maxThreshold)).toBe(200);
    expect(res.body.thresholdSource).toBe('MANUAL');
    expect(res.body.maxThresholdSet).toBe(true);
  });

  it('PATCH /stock/:branchId/:productId/threshold — hiçbir değer verilmezse 400 döner', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/stock/${ctx.branchId}/${productId}/threshold`)
      .set('Authorization', subeMuduruAuthHeader)
      .send({})
      .expect(400);
  });

  // ── (e) Günlük özet ───────────────────────────────────────────────────────

  it('GET /stock/:branchId/daily-report — beklenen alan yapısıyla 200 döner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/stock/${ctx.branchId}/daily-report`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(typeof res.body.date).toBe('string');
    expect(typeof res.body.grossRevenue).toBe('number');
    expect(Array.isArray(res.body.topSellers)).toBe(true);
    expect(Array.isArray(res.body.bottomSellers)).toBe(true);
    expect(Array.isArray(res.body.cashierSessions)).toBe(true);

    // Bu suite'te yukarıda cashierSessionId'siz bir satış yapıldı (8 adet),
    // bugünün cirosuna yansımalı.
    const soldProduct = res.body.topSellers.find(
      (p: { productId: string }) => p.productId === productId,
    );
    expect(soldProduct).toBeDefined();
    expect(soldProduct.totalQty).toBe(8);
    expect(soldProduct.totalRevenue).toBeCloseTo(8 * SALE_PRICE, 2);
  });
});
