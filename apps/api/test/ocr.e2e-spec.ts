/**
 * Fatura Tarama (OCR) akışı — mock modda (OCR_ENABLED=false, bkz. .env.test)
 * sabit MOCK_RAW satırları döner (ocr.service.ts): 'Coca-Cola 33cl' (qty 24,
 * confidence 0.95), 'Su 0.5L' (qty 48, confidence 0.92), 'Bilinmeyen Ürün XYZ'
 * (confidence 0.45 → AUTO_MATCH_THRESHOLD'un altında, hep UNMATCHED kalır).
 *
 * Testler yalnızca 'Coca-Cola 33cl' adında bir ürün oluşturuyor — fuzzy match
 * (token_sort_ratio) aynı string için 100 puan verir, dolayısıyla o satır
 * güvenle AUTO_MATCHED olur.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanupTenants,
  createCategory,
  signupAndGetContext,
  uniqueSuffix,
  type SignedUpContext,
} from './setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('OCR / Fatura Tarama (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: SignedUpContext;
  let authHeader: string;
  let supplierId: string;
  let productId: string;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx = await signupAndGetContext(app);
    authHeader = `Bearer ${ctx.accessToken}`;
    createdTaxNumbers.push(ctx.payload.taxNumber);

    const supplierRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', authHeader)
      .send({ name: `E2E OCR Tedarikçi ${uniqueSuffix()}`, whatsappNumber: '+905551234567' })
      .expect(201);
    supplierId = supplierRes.body.id;

    const category = await createCategory(prisma, ctx.tenantId, 'E2E OCR Kategorisi');

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader)
      .send({
        sku: `E2E-OCR-${uniqueSuffix()}`,
        // Mock OCR satırıyla (MOCK_RAW) birebir aynı isim — fuzzy match 100 puan alır.
        name: 'Coca-Cola 33cl',
        unit: 'adet',
        categoryId: category.id,
      })
      .expect(201);
    productId = productRes.body.id;

    // Stok kaydı önceden var olmalı: confirmScan/confirmReturn stockLevel'ı
    // `updateMany` ile artırır/azaltır — kayıt yoksa sessizce 0 satır etkiler.
    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId, items: [{ productId, quantity: 0 }] })
      .expect(201);
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  async function queryStockQuantity(): Promise<number> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/stock/query')
      .query({ search: 'Coca-Cola' })
      .set('Authorization', authHeader)
      .expect(200);

    const level = res.body.find(
      (l: { product: { id: string } }) => l.product.id === productId,
    );
    expect(level).toBeDefined();
    return Number(level.quantity);
  }

  // ── (a) Tarama — mock modda fuzzy match ──────────────────────────────────

  it('POST /ocr/scan — mock modda parsedLines döner, Coca-Cola satırı AUTO_MATCHED olur', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ocr/scan')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId })
      .expect(201);

    expect(typeof res.body.scanId).toBe('string');
    expect(Array.isArray(res.body.parsedLines)).toBe(true);

    const cocaLine = res.body.parsedLines.find(
      (l: { name: string }) => l.name === 'Coca-Cola 33cl',
    );
    expect(cocaLine).toBeDefined();
    expect(cocaLine.matchStatus).toBe('AUTO_MATCHED');
    expect(cocaLine.matchedProductId).toBe(productId);

    // Düşük OCR güvenli satır (0.45 < 0.85 eşiği) her zaman UNMATCHED kalır.
    const unknownLine = res.body.parsedLines.find(
      (l: { name: string }) => l.name === 'Bilinmeyen Ürün XYZ',
    );
    expect(unknownLine.matchStatus).toBe('UNMATCHED');
  });

  // ── (b) Onay — tam teslimat → stok artışı ────────────────────────────────

  it('POST /ocr/scan/:scanId/confirm — allItemsReceived:true stok seviyesini doğru artırır', async () => {
    const scan = await request(app.getHttpServer())
      .post('/api/v1/ocr/scan')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/ocr/scan/${scan.body.scanId}/confirm`)
      .set('Authorization', authHeader)
      .send({
        supplierId,
        allItemsReceived: true,
        lines: [{ productId, qty: 24, unit: 'adet' }],
      })
      .expect(200);

    expect(res.body.confirmedCount).toBe(1);
    expect(res.body.stockUpdates).toHaveLength(1);
    expect(Number(res.body.stockUpdates[0].newQuantity)).toBe(24);

    expect(await queryStockQuantity()).toBe(24);
  });

  // ── (c) Eksik teslimat → otomatik PRODUCT borç kaydı ─────────────────────

  it('POST /ocr/scan/:scanId/confirm — eksik teslimatta Alacak Verecek\'te otomatik PRODUCT borç oluşur', async () => {
    const scan = await request(app.getHttpServer())
      .post('/api/v1/ocr/scan')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/ocr/scan/${scan.body.scanId}/confirm`)
      .set('Authorization', authHeader)
      .send({
        supplierId,
        allItemsReceived: false,
        lines: [{ productId, qty: 24, unit: 'adet' }],
        // Faturada 24 var, yalnızca 20 teslim alındı → 4 eksik.
        deliveredLines: [{ productId, receivedQty: 20 }],
      })
      .expect(200);

    expect(res.body.debtsCreated).toHaveLength(1);
    // Stoğa yalnız gerçekten teslim alınan (20) eklenir: 24 (b'den) + 20 = 44.
    expect(await queryStockQuantity()).toBe(44);

    const debtsRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .expect(200);

    const debt = debtsRes.body.find(
      (d: { id: string }) => d.id === res.body.debtsCreated[0],
    );
    expect(debt).toBeDefined();
    expect(debt.direction).toBe('RECEIVABLE');
    expect(debt.debtType).toBe('PRODUCT');
    expect(debt.productLines[0].quantity).toBe(4); // eksik miktar
    expect(debt.productLines[0].productId).toBe(productId);
  });

  // ── (d) İade faturası — nakit iade → stok azalır ─────────────────────────

  it('POST /ocr/scan/:scanId/confirm-return — CASH iade stoğu azaltır ve RECEIVABLE/CASH borç oluşturur', async () => {
    const scan = await request(app.getHttpServer())
      .post('/api/v1/ocr/scan')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId })
      .expect(201);

    const beforeQty = await queryStockQuantity();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/ocr/scan/${scan.body.scanId}/confirm-return`)
      .set('Authorization', authHeader)
      .send({
        supplierId,
        invoiceDate: '2026-08-01',
        returnTotal: 50,
        settlementType: 'CASH',
        lines: [{ productId, qty: 5, unit: 'adet' }],
      })
      .expect(200);

    expect(typeof res.body.debtId).toBe('string');
    expect(await queryStockQuantity()).toBe(beforeQty - 5);

    const debtsRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .expect(200);

    const debt = debtsRes.body.find((d: { id: string }) => d.id === res.body.debtId);
    expect(debt).toBeDefined();
    expect(debt.direction).toBe('RECEIVABLE');
    expect(debt.debtType).toBe('CASH');
    expect(Number(debt.amount)).toBe(50);
    expect(debt.source).toBe('OCR');
  });

  // ── (e) Otomatik CASH borç — kısmi ödemeyle ──────────────────────────────
  //
  // amount HER ZAMAN faturanın tam/ham tutarı olmalı — kısmi ödemeden
  // etkilenmemeli. remainingAmount ise amount - paidAmount olmalı. Daha önce
  // ikisine de yanlışlıkla `diff` (invoiceTotal - paidAmount) yazılıyordu,
  // yani paidAmount iki kez düşüyordu (bkz. ocr.service.ts'teki yorum).

  it('POST /ocr/scan/:scanId/confirm — invoiceTotal+paidAmount ile otomatik CASH borç: amount=invoiceTotal, remainingAmount=invoiceTotal-paidAmount', async () => {
    const scan = await request(app.getHttpServer())
      .post('/api/v1/ocr/scan')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/ocr/scan/${scan.body.scanId}/confirm`)
      .set('Authorization', authHeader)
      .send({
        supplierId,
        allItemsReceived: true,
        lines: [{ productId, qty: 1, unit: 'adet' }],
        invoiceTotal: 20000,
        paidAmount: 5000,
      })
      .expect(200);

    expect(res.body.debtsCreated).toHaveLength(1);

    const debtsRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .expect(200);

    const debt = debtsRes.body.find(
      (d: { id: string }) => d.id === res.body.debtsCreated[0],
    );
    expect(debt).toBeDefined();
    expect(debt.debtType).toBe('CASH');
    expect(debt.direction).toBe('PAYABLE');
    expect(debt.status).toBe('OPEN');
    expect(Number(debt.amount)).toBe(20000);
    expect(Number(debt.remainingAmount)).toBe(15000);
  });

  // ── (f) Otomatik CASH borç — hiç ödeme yapılmadan (paidAmount=0) ─────────

  it('POST /ocr/scan/:scanId/confirm — paidAmount=0 iken remainingAmount amount ile aynı kalır', async () => {
    const scan = await request(app.getHttpServer())
      .post('/api/v1/ocr/scan')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/ocr/scan/${scan.body.scanId}/confirm`)
      .set('Authorization', authHeader)
      .send({
        supplierId,
        allItemsReceived: true,
        lines: [{ productId, qty: 1, unit: 'adet' }],
        invoiceTotal: 8000,
        paidAmount: 0,
      })
      .expect(200);

    expect(res.body.debtsCreated).toHaveLength(1);

    const debtsRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .expect(200);

    const debt = debtsRes.body.find(
      (d: { id: string }) => d.id === res.body.debtsCreated[0],
    );
    expect(debt).toBeDefined();
    expect(Number(debt.amount)).toBe(8000);
    // paidAmount=0 → remainingAmount amount'tan etkilenmemeli, ona eşit kalmalı.
    expect(Number(debt.remainingAmount)).toBe(8000);
  });
});
