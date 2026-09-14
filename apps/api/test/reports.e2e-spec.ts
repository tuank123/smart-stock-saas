/**
 * Raporlar (reports.controller.ts) — günlük/aylık rapor üretimi, listeleme,
 * tekil erişim ve fiyat anomalileri. Controller sınıf-seviyesinde
 * @Roles(PATRON) — SUBE_MUDURU DAHİL hiçbir başka rol erişemez (stock/
 * orders/portal'daki "tek şubeli PATRON = fiili şube müdürü" istisnası
 * BURADA YOK, plan kontrolü de yok — her PATRON, plan fark etmeksizin
 * erişebilir).
 *
 * "Günlük Rapor" burada stock.controller.ts'teki `:branchId/daily-report`
 * (satış özeti) İLE KARIŞTIRILMAMALI — bu, farklı bir backend özelliği
 * (ScheduledReport tablosu, sipariş/stok-hareketi/anomali özetleri).
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
import { withTenantContext } from '../src/common/utils/tenant-context';

describe('Raporlar / Reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx1: SignedUpContext;
  let ctx2: SignedUpContext;
  let authHeader1: string;
  let subeAuthHeader1: string;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx1 = await signupAndGetContext(app);
    authHeader1 = `Bearer ${ctx1.accessToken}`;
    createdTaxNumbers.push(ctx1.payload.taxNumber);

    ctx2 = await signupAndGetContext(app);
    createdTaxNumbers.push(ctx2.payload.taxNumber);

    const subeMuduru1 = await createRoleUser(app, prisma, {
      tenantId: ctx1.tenantId,
      branchId: ctx1.branchId,
      role: UserRole.SUBE_MUDURU,
    });
    subeAuthHeader1 = `Bearer ${subeMuduru1.accessToken}`;
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  // ── (a) Yetkisiz rol reddi ────────────────────────────────────────────────

  it('POST /reports/generate/daily — SUBE_MUDURU rolüyle 403 döner (yalnızca PATRON)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/reports/generate/daily')
      .set('Authorization', subeAuthHeader1)
      .send({})
      .expect(403);
  });

  it('GET /reports — SUBE_MUDURU rolüyle 403 döner', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set('Authorization', subeAuthHeader1)
      .expect(403);
  });

  // ── (b) Günlük rapor üretimi ──────────────────────────────────────────────

  let dailyReportId: string;

  it('POST /reports/generate/daily — PATRON için doğru şekilde üretir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/reports/generate/daily')
      .set('Authorization', authHeader1)
      .send({})
      .expect(201);

    expect(res.body.reportType).toBe('DAILY');
    expect(res.body.tenantId).toBe(ctx1.tenantId);
    expect(res.body.payload.branches.some((b: { branchId: string }) => b.branchId === ctx1.branchId)).toBe(true);
    expect(typeof res.body.payload.totals.totalOrders).toBe('number');
    dailyReportId = res.body.id;
  });

  // ── (b-2) Günlük rapor — Ciro + Zayiatlar (şube bazlı) ────────────────────
  //
  // generateDailyReport'un branches[] dizisindeki her şube artık kendi
  // revenue/defectiveItems'ını taşımalı (getDailyReport, stock.service.ts
  // ile AYNI formül/mantık — SALE hareketleri, WASTED durumundaki
  // DefectiveItemReport'lar). "Önce/sonra" karşılaştırması yapılıyor ki bu
  // tenant'ta testten önce zaten var olabilecek başka veriden etkilenmesin.

  it('POST /reports/generate/daily — şube bazlı revenue ve defectiveItems doğru hesaplanır', async () => {
    const before = await request(app.getHttpServer())
      .post('/api/v1/reports/generate/daily')
      .set('Authorization', authHeader1)
      .send({})
      .expect(201);
    const branchBefore = before.body.payload.branches.find(
      (b: { branchId: string }) => b.branchId === ctx1.branchId,
    );
    const revenueBefore = branchBefore.revenue;
    const totalRevenueBefore = before.body.payload.totals.totalRevenue;

    const category = await createCategory(prisma, ctx1.tenantId, 'E2E Rapor Günlük Kategorisi');
    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader1)
      .send({
        sku: `E2E-RAPOR-GUNLUK-${uniqueSuffix()}`,
        name: 'E2E Rapor Günlük Ürünü',
        unit: 'adet',
        categoryId: category.id,
      })
      .expect(201);
    const productId = productRes.body.id;
    await setProductSalePrice(prisma, productId, 10);

    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader1)
      .send({ branchId: ctx1.branchId, items: [{ productId, quantity: 50 }] })
      .expect(201);

    // Satış: 4 adet × 10 TL = 40 TL.
    await request(app.getHttpServer())
      .post(`/api/v1/stock/${ctx1.branchId}/sale`)
      .set('Authorization', authHeader1)
      .send({ items: [{ productId, quantity: 4 }], paymentMethod: 'CASH' })
      .expect(201);

    // Zayiat: 2 adet, bugün WASTED.
    const defectiveRes = await request(app.getHttpServer())
      .post(`/api/v1/defective-items/${ctx1.branchId}`)
      .set('Authorization', authHeader1)
      .send({ productId, quantity: 2, photoBase64: 'data:image/jpeg;base64,ZmFrZS1waG90bw==' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/defective-items/${defectiveRes.body.id}/waste`)
      .set('Authorization', authHeader1)
      .expect(200);

    const after = await request(app.getHttpServer())
      .post('/api/v1/reports/generate/daily')
      .set('Authorization', authHeader1)
      .send({})
      .expect(201);
    const branchAfter = after.body.payload.branches.find(
      (b: { branchId: string }) => b.branchId === ctx1.branchId,
    );

    expect(branchAfter.revenue).toBe(revenueBefore + 40);
    expect(after.body.payload.totals.totalRevenue).toBe(totalRevenueBefore + 40);

    const defectiveEntry = branchAfter.defectiveItems.find(
      (d: { productId: string }) => d.productId === productId,
    );
    expect(defectiveEntry).toBeDefined();
    expect(defectiveEntry.productName).toBe('E2E Rapor Günlük Ürünü');
    expect(defectiveEntry.quantity).toBe(2);
  });

  // ── (b-3) Günlük rapor — Fiyat Anomalisi Detayları (tenant-geneli) ────────
  //
  // PriceChangeLog.branchId OPSİYONEL (schema.prisma) — bu yüzden
  // priceAnomalyDetails, defectiveItems/revenue'nun aksine, şube bazlı DEĞİL,
  // tenant-geneli tek düz liste (generateMonthlyReport'taki AYNI karar).

  it('POST /reports/generate/daily — priceAnomalyDetails, anomali kayıtlarının ürün/fiyat/tarih bilgilerini doğru taşır', async () => {
    const category = await createCategory(prisma, ctx1.tenantId, 'E2E Rapor Günlük Anomali Kategorisi');
    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader1)
      .send({
        sku: `E2E-RAPOR-GUNLUK-ANOMALI-${uniqueSuffix()}`,
        name: 'E2E Rapor Günlük Anomali Ürünü',
        unit: 'adet',
        categoryId: category.id,
      })
      .expect(201);
    const productId = productRes.body.id;

    await withTenantContext(prisma, { isSuperAdmin: true }, (tx) =>
      tx.priceChangeLog.create({
        data: {
          tenantId: ctx1.tenantId,
          productId,
          branchId: ctx1.branchId,
          oldPrice: 50,
          newPrice: 150,
          changePct: 200,
          anomalyFlag: true,
          changedBy: ctx1.userId,
        },
      }),
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/reports/generate/daily')
      .set('Authorization', authHeader1)
      .send({})
      .expect(201);

    const detail = res.body.payload.priceAnomalyDetails.find(
      (d: { productId: string }) => d.productId === productId,
    );
    expect(detail).toBeDefined();
    expect(detail.productName).toBe('E2E Rapor Günlük Anomali Ürünü');
    expect(detail.oldPrice).toBe(50);
    expect(detail.newPrice).toBe(150);
    expect(detail.changePct).toBe(200);
    expect(typeof detail.createdAt).toBe('string');
  });

  // ── (c) Aylık rapor üretimi ───────────────────────────────────────────────

  let monthlyReportId: string;

  it('POST /reports/generate/monthly — PATRON için doğru şekilde üretir', async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const res = await request(app.getHttpServer())
      .post('/api/v1/reports/generate/monthly')
      .set('Authorization', authHeader1)
      .send({ year, month })
      .expect(201);

    expect(res.body.reportType).toBe('MONTHLY');
    expect(res.body.payload.period).toBe(`${year}-${String(month).padStart(2, '0')}`);
    monthlyReportId = res.body.id;
  });

  // ── (c-2) Aylık rapor — Zayiatlar (Ürün Zayiatları'ndan WASTED kayıtlar) ──
  //
  // Aynı üründen ay içinde 2 AYRI WASTED kaydı oluşturulur — aylık rapor
  // bunları TEK bir satırda toplamalı (bkz. generateMonthlyReport'taki
  // defectiveByProduct Map'i).

  it('POST /reports/generate/monthly — ay içindeki WASTED zayiat kayıtları ürün bazında TOPLANMIŞ olarak defectiveItems\'ta görünür', async () => {
    const category = await createCategory(prisma, ctx1.tenantId, 'E2E Rapor Zayiat Kategorisi');
    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader1)
      .send({
        sku: `E2E-RAPOR-ZAYIAT-${uniqueSuffix()}`,
        name: 'E2E Rapor Zayiat Ürünü',
        unit: 'adet',
        categoryId: category.id,
      })
      .expect(201);
    const productId = productRes.body.id;

    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader1)
      .send({ branchId: ctx1.branchId, items: [{ productId, quantity: 20 }] })
      .expect(201);

    // İki AYRI zayiat kaydı, ikisi de WASTED — aylık raporda tek satırda
    // toplanmalı: 3 + 4 = 7.
    for (const qty of [3, 4]) {
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/defective-items/${ctx1.branchId}`)
        .set('Authorization', authHeader1)
        .send({ productId, quantity: qty, photoBase64: 'data:image/jpeg;base64,ZmFrZS1waG90bw==' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/defective-items/${createRes.body.id}/waste`)
        .set('Authorization', authHeader1)
        .expect(200);
    }

    const now = new Date();
    const res = await request(app.getHttpServer())
      .post('/api/v1/reports/generate/monthly')
      .set('Authorization', authHeader1)
      .send({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 })
      .expect(201);

    const entries = res.body.payload.defectiveItems.filter(
      (d: { productId: string }) => d.productId === productId,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].totalQuantity).toBe(7);
    expect(entries[0].productName).toBe('E2E Rapor Zayiat Ürünü');
  });

  // ── (c-3) Aylık rapor — Toplam Ciro (DAILY rapor üretilmeden) ────────────
  //
  // monthlyRevenue, getDailyReport'taki (stock.service.ts) AYNI formülü
  // (SALE hareketlerinde quantity × unitPrice) doğrudan StockMovement'tan
  // hesaplıyor — hiçbir DAILY ScheduledReport üretilmemiş olsa bile doğru
  // sonucu vermeli. "Önce/sonra" karşılaştırması yapılıyor ki bu tenant'ta
  // testten önce zaten var olabilecek başka satışlardan etkilenmesin.

  it('POST /reports/generate/monthly — hiç DAILY rapor üretilmemiş olsa bile monthlyRevenue SALE hareketlerinden doğru hesaplanır', async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const before = await request(app.getHttpServer())
      .post('/api/v1/reports/generate/monthly')
      .set('Authorization', authHeader1)
      .send({ year, month })
      .expect(201);
    const revenueBefore = before.body.payload.totals.monthlyRevenue;

    const category = await createCategory(prisma, ctx1.tenantId, 'E2E Rapor Ciro Kategorisi');
    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader1)
      .send({
        sku: `E2E-RAPOR-CIRO-${uniqueSuffix()}`,
        name: 'E2E Rapor Ciro Ürünü',
        unit: 'adet',
        categoryId: category.id,
      })
      .expect(201);
    const productId = productRes.body.id;
    await setProductSalePrice(prisma, productId, 25);

    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader1)
      .send({ branchId: ctx1.branchId, items: [{ productId, quantity: 100 }] })
      .expect(201);

    // İki ayrı satış: 3 + 2 = 5 adet × 25 TL = 125 TL.
    await request(app.getHttpServer())
      .post(`/api/v1/stock/${ctx1.branchId}/sale`)
      .set('Authorization', authHeader1)
      .send({ items: [{ productId, quantity: 3 }], paymentMethod: 'CASH' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/stock/${ctx1.branchId}/sale`)
      .set('Authorization', authHeader1)
      .send({ items: [{ productId, quantity: 2 }], paymentMethod: 'CASH' })
      .expect(201);

    const after = await request(app.getHttpServer())
      .post('/api/v1/reports/generate/monthly')
      .set('Authorization', authHeader1)
      .send({ year, month })
      .expect(201);

    expect(after.body.payload.totals.monthlyRevenue).toBe(revenueBefore + 125);
  });

  // ── (c-4) Aylık rapor — Fiyat Anomalisi Detayları ─────────────────────────
  //
  // Anomali TESPİTİ (`%50 eşiği) portal.service.ts:applyPricesToProducts'ta
  // yapılıyor — burada test edilen o değil, generateMonthlyReport'un mevcut
  // PriceChangeLog(anomalyFlag:true) kayıtlarını doğru ürün/fiyat/tarih
  // bilgisiyle priceAnomalyDetails'e YÜZEYE ÇIKARIP ÇIKARMADIĞI. Bu yüzden
  // gerçek portal/WhatsApp akışını kurmak yerine, o akışın YAZACAĞI şekli
  // doğrudan simüle ediyoruz (withTenantContext ile, debts.e2e-spec.ts'teki
  // AYNI desen).

  it('POST /reports/generate/monthly — priceAnomalyDetails, anomali kayıtlarının ürün/fiyat/tarih bilgilerini doğru taşır', async () => {
    const category = await createCategory(prisma, ctx1.tenantId, 'E2E Rapor Anomali Kategorisi');
    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader1)
      .send({
        sku: `E2E-RAPOR-ANOMALI-${uniqueSuffix()}`,
        name: 'E2E Rapor Anomali Ürünü',
        unit: 'adet',
        categoryId: category.id,
      })
      .expect(201);
    const productId = productRes.body.id;

    await withTenantContext(prisma, { isSuperAdmin: true }, (tx) =>
      tx.priceChangeLog.create({
        data: {
          tenantId: ctx1.tenantId,
          productId,
          branchId: ctx1.branchId,
          oldPrice: 100,
          newPrice: 200,
          changePct: 100,
          anomalyFlag: true,
          changedBy: ctx1.userId,
        },
      }),
    );

    const now = new Date();
    const res = await request(app.getHttpServer())
      .post('/api/v1/reports/generate/monthly')
      .set('Authorization', authHeader1)
      .send({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 })
      .expect(201);

    const detail = res.body.payload.priceAnomalyDetails.find(
      (d: { productId: string }) => d.productId === productId,
    );
    expect(detail).toBeDefined();
    expect(detail.productName).toBe('E2E Rapor Anomali Ürünü');
    expect(detail.oldPrice).toBe(100);
    expect(detail.newPrice).toBe(200);
    expect(detail.changePct).toBe(100);
    expect(typeof detail.createdAt).toBe('string');
  });

  // ── (d) Anomaliler ────────────────────────────────────────────────────────

  it('GET /reports/anomalies — dizi döner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/anomalies')
      .set('Authorization', authHeader1)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── (e) Listeleme + tekil erişim — tenant izolasyonu ─────────────────────

  it('GET /reports — üretilen DAILY ve MONTHLY raporlar listede görünür, başka tenant\'ınki sızmaz', async () => {
    const authHeader2 = `Bearer ${ctx2.accessToken}`;
    await request(app.getHttpServer())
      .post('/api/v1/reports/generate/daily')
      .set('Authorization', authHeader2)
      .send({})
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set('Authorization', authHeader1)
      .expect(200);

    const ids = res.body.items.map((r: { id: string }) => r.id);
    expect(ids).toContain(dailyReportId);
    expect(ids).toContain(monthlyReportId);
    expect(res.body.items.every((r: { id: string }) => r.id !== undefined)).toBe(true);

    // ctx2'nin raporu ctx1'in listesinde OLMAMALI (id'ler farklı tenant'a ait).
    const res2 = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set('Authorization', authHeader2)
      .expect(200);
    const ctx2ReportId = res2.body.items[0].id;
    expect(ids).not.toContain(ctx2ReportId);
  });

  it('GET /reports/:id — kendi raporunu görebilir, isRead işaretlenir', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/reports/${dailyReportId}`)
      .set('Authorization', authHeader1)
      .expect(200);
    expect(res.body.id).toBe(dailyReportId);
    expect(res.body.isRead).toBe(true);
    expect(res.body.readAt).not.toBeNull();
  });

  it('GET /reports/:id — başka tenant\'ın raporuna erişim 404 döner', async () => {
    const authHeader2 = `Bearer ${ctx2.accessToken}`;
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set('Authorization', authHeader2)
      .expect(200);
    const ctx2ReportId = listRes.body.items[0].id;

    await request(app.getHttpServer())
      .get(`/api/v1/reports/${ctx2ReportId}`)
      .set('Authorization', authHeader1)
      .expect(404);
  });

  // ── (f) Sayfalama ─────────────────────────────────────────────────────────
  //
  // admin/tenants, products, stock, orders, ocr ile aynı desen:
  // {items,total,page,pageSize}. Bu noktada ctx1'de en az 2 rapor var
  // (dailyReportId + monthlyReportId).

  it('GET /reports — {items,total,page,pageSize} şeklinde, varsayılan sayfa/pageSize ile döner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set('Authorization', authHeader1)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(50);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });

  it('GET /reports?pageSize=1&page=2 — ikinci sayfaya doğru geçer, total tüm eşleşen kayıt sayısını yansıtır', async () => {
    const page1 = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .query({ pageSize: 1, page: 1 })
      .set('Authorization', authHeader1)
      .expect(200);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.total).toBeGreaterThanOrEqual(2);

    const page2 = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .query({ pageSize: 1, page: 2 })
      .set('Authorization', authHeader1)
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.page).toBe(2);
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
  });

  it('GET /reports?pageSize=101 — üst sınırı (100) aşan pageSize 400 döner', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/reports')
      .query({ pageSize: 101 })
      .set('Authorization', authHeader1)
      .expect(400);
  });

  it('GET /reports?type=DAILY — tip filtresi + sayfalama birlikte doğru total döner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .query({ type: 'DAILY', pageSize: 50 })
      .set('Authorization', authHeader1)
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(dailyReportId);
    expect(res.body.items[0].reportType).toBe('DAILY');
  });
});
