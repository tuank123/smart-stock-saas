/**
 * Geçici Kasa (tek şubeli PATRON için sepet bazlı satış) akışı — şifre
 * doğrulama, oturum açma, satış, fiş listesi, oturum kapatma ve yetersiz
 * stok reddi.
 *
 * Bu uç noktaların hepsi @Roles(PATRON) + STARTER plan kontrolüyle sınırlı
 * (stock.service.ts → openCashierSession/recordSale/closeCashierSession),
 * bu yüzden signupAndGetContext()'in varsayılan 'TEK_SUBE' businessType'ı
 * kasıtlı olarak değiştirilmiyor.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanupTenants,
  createCategory,
  setProductSalePrice,
  signupAndGetContext,
  uniqueSuffix,
  type SignedUpContext,
} from './setup';
import { PrismaService } from '../src/prisma/prisma.service';

const SALE_PRICE = 25.5;
const INITIAL_QUANTITY = 50;

describe('Geçici Kasa (e2e)', () => {
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

    const category = await createCategory(prisma, ctx.tenantId, 'E2E Kasa Kategorisi');

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader)
      .send({
        sku: `E2E-KASA-${uniqueSuffix()}`,
        name: 'E2E Kasa Ürünü',
        unit: 'adet',
        categoryId: category.id,
      })
      .expect(201);
    productId = productRes.body.id;

    // CreateProductDto salePrice almıyor (portal/agent akışlarına özel);
    // testte doğrudan Prisma ile set ediyoruz — bkz. setup.ts yorumu.
    await setProductSalePrice(prisma, productId, SALE_PRICE);

    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId, items: [{ productId, quantity: INITIAL_QUANTITY }] })
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

  // ── (a) Şifre doğrulama ──────────────────────────────────────────────────

  it('POST /auth/verify-password — doğru şifre 200 + valid:true döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-password')
      .set('Authorization', authHeader)
      .send({ password: ctx.payload.password })
      .expect(200);

    expect(res.body.valid).toBe(true);
  });

  it('POST /auth/verify-password — yanlış şifre 200 + valid:false döner (exception fırlatmaz)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-password')
      .set('Authorization', authHeader)
      .send({ password: 'YanlisSifre123' })
      .expect(200);

    expect(res.body.valid).toBe(false);
  });

  // ── (b) Oturum açma ──────────────────────────────────────────────────────

  let sessionId: string;

  it('POST /stock/:branchId/cashier-session/open — sessionId döner', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/stock/${ctx.branchId}/cashier-session/open`)
      .set('Authorization', authHeader)
      .expect(201);

    expect(typeof res.body.sessionId).toBe('string');
    sessionId = res.body.sessionId;
  });

  // ── (c) Satış ─────────────────────────────────────────────────────────────

  let transactionId: string;

  it('POST /stock/:branchId/sale — satış stok seviyesini doğru düşürür', async () => {
    const before = await getQuantity();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/stock/${ctx.branchId}/sale`)
      .set('Authorization', authHeader)
      .send({
        items: [{ productId, quantity: 5 }],
        paymentMethod: 'CASH',
        cashierSessionId: sessionId,
      })
      .expect(201);

    transactionId = res.body.transactionId;
    expect(res.body.totalAmount).toBeCloseTo(5 * SALE_PRICE, 2);
    expect(res.body.paymentMethod).toBe('CASH');

    expect(await getQuantity()).toBe(before - 5);
  });

  // ── (d) Fiş listesi ───────────────────────────────────────────────────────

  it('GET /stock/:branchId/cashier-sessions — oturumun receipts listesinde satış doğru görünür', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/stock/${ctx.branchId}/cashier-sessions`)
      .set('Authorization', authHeader)
      .expect(200);

    const session = res.body.find((s: { id: string }) => s.id === sessionId);
    expect(session).toBeDefined();
    expect(session.closedAt).toBeNull();

    const receipt = session.receipts.find(
      (r: { transactionId: string }) => r.transactionId === transactionId,
    );
    expect(receipt).toBeDefined();
    expect(receipt.paymentMethod).toBe('CASH');
    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0].quantity).toBe(5);
    expect(receipt.items[0].unitPrice).toBeCloseTo(SALE_PRICE, 2);
    expect(receipt.total).toBeCloseTo(5 * SALE_PRICE, 2);
  });

  // ── (e) Oturumu kapatma ───────────────────────────────────────────────────

  it('PATCH /stock/:branchId/cashier-session/:sessionId/close — closedAt dolar', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/stock/${ctx.branchId}/cashier-session/${sessionId}/close`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(res.body.closed).toBe(true);

    const sessionsRes = await request(app.getHttpServer())
      .get(`/api/v1/stock/${ctx.branchId}/cashier-sessions`)
      .set('Authorization', authHeader)
      .expect(200);

    const session = sessionsRes.body.find((s: { id: string }) => s.id === sessionId);
    expect(session.closedAt).not.toBeNull();
  });

  // ── (f) Yetersiz stok ─────────────────────────────────────────────────────

  it('POST /stock/:branchId/sale — mevcut stoktan fazla miktar 400 döner', async () => {
    const current = await getQuantity();

    const res = await request(app.getHttpServer())
      .post(`/api/v1/stock/${ctx.branchId}/sale`)
      .set('Authorization', authHeader)
      .send({
        items: [{ productId, quantity: current + 1000 }],
        paymentMethod: 'CASH',
      })
      .expect(400);

    expect(res.body.message).toContain('yetersiz stok');

    // Reddedilen satış stoğu değiştirmemeli.
    expect(await getQuantity()).toBe(current);
  });
});
