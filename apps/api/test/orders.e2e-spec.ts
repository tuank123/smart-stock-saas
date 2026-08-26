/**
 * Satın Alma Siparişleri (orders.controller.ts) — oluşturma, onay, mal kabul
 * (stok artışı) ve iptal akışının uçtan uca doğrulaması.
 *
 * POST /orders yalnızca @Roles(SUBE_MUDURU) — signupAndGetContext() PATRON
 * döndüğü için sipariş oluşturma/onay/iptal/mal-kabul burada createRoleUser()
 * ile mint edilen ayrı bir SUBE_MUDURU token'ıyla yapılıyor (bkz. setup.ts).
 * Yetkisiz rol testi için de ayrıca bir KASIYER token'ı kullanılıyor.
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

describe('Satın Alma Siparişleri / Orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: SignedUpContext;
  let authHeader: string;
  let subeMuduruAuthHeader: string;
  let kasiyerAuthHeader: string;
  let supplierId: string;
  let productId: string;

  const createdTaxNumbers: string[] = [];
  const EXISTING_STOCK = 5;
  const ORDER_QTY = 20;

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

    const kasiyer = await createRoleUser(app, prisma, {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      role: UserRole.KASIYER,
    });
    kasiyerAuthHeader = `Bearer ${kasiyer.accessToken}`;

    const supplierRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', authHeader)
      .send({ name: `E2E Sipariş Tedarikçi ${uniqueSuffix()}`, whatsappNumber: '+905551112233' })
      .expect(201);
    supplierId = supplierRes.body.id;

    const category = await createCategory(prisma, ctx.tenantId, 'E2E Sipariş Kategorisi');

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader)
      .send({
        sku: `E2E-ORD-${uniqueSuffix()}`,
        name: 'E2E Sipariş Ürünü',
        unit: 'adet',
        categoryId: category.id,
      })
      .expect(201);
    productId = productRes.body.id;

    // Mal kabulde artışın (yaratma değil) doğru hesaplandığını göstermek için
    // şubede zaten bir miktar stok olsun.
    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId, items: [{ productId, quantity: EXISTING_STOCK }] })
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

  // ── (a) Sipariş oluşturma ────────────────────────────────────────────────

  let orderId: string;

  it('POST /orders — DRAFT statüsüyle 201 döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', subeMuduruAuthHeader)
      .send({
        branchId: ctx.branchId,
        supplierId,
        items: [{ productId, quantityOrdered: ORDER_QTY }],
      })
      .expect(201);

    orderId = res.body.id;
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.items).toHaveLength(1);
    expect(Number(res.body.items[0].quantityOrdered)).toBe(ORDER_QTY);
  });

  it('POST /orders — PATRON (SUBE_MUDURU olmayan) rolüyle 403 döner', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', authHeader)
      .send({
        branchId: ctx.branchId,
        supplierId,
        items: [{ productId, quantityOrdered: 1 }],
      })
      .expect(403);
  });

  // ── (b) Onay ──────────────────────────────────────────────────────────────

  it('PATCH /orders/:id/approve — onay sonrası status APPROVED olur', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/approve`)
      .set('Authorization', subeMuduruAuthHeader)
      .expect(200);

    expect(res.body.status).toBe('APPROVED');
    expect(res.body.approvedAt).not.toBeNull();
  });

  it('PATCH /orders/:id/approve — DRAFT olmayan siparişi tekrar onaylamak 400 döner', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/approve`)
      .set('Authorization', subeMuduruAuthHeader)
      .expect(400);
  });

  // ── (c) Mal kabul — en kritik test: StockLevel artışı ───────────────────

  it('PATCH /orders/:id/receive — mal kabulünde StockLevel doğru artar ve status RECEIVED olur', async () => {
    const before = await getQuantity();
    expect(before).toBe(EXISTING_STOCK);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/receive`)
      .set('Authorization', subeMuduruAuthHeader)
      .send({ items: [{ productId, quantityReceived: ORDER_QTY }] })
      .expect(200);

    expect(res.body.status).toBe('RECEIVED');
    expect(Number(res.body.items[0].quantityReceived)).toBe(ORDER_QTY);

    expect(await getQuantity()).toBe(before + ORDER_QTY);
  });

  // ── (d) Yetkisiz rol + iptal ─────────────────────────────────────────────

  let cancelOrderId: string;

  it('PATCH /orders/:id/approve — KASIYER rolüyle 403 döner (ikinci, ayrı bir DRAFT sipariş üzerinde)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', subeMuduruAuthHeader)
      .send({
        branchId: ctx.branchId,
        supplierId,
        items: [{ productId, quantityOrdered: 10 }],
      })
      .expect(201);
    cancelOrderId = createRes.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${cancelOrderId}/approve`)
      .set('Authorization', kasiyerAuthHeader)
      .expect(403);

    // Reddedilen onay denemesi statüyü değiştirmemeli.
    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/orders/draft/${ctx.branchId}`)
      .set('Authorization', subeMuduruAuthHeader)
      .expect(200);
    expect(listRes.body.some((o: { id: string }) => o.id === cancelOrderId)).toBe(true);
  });

  it('PATCH /orders/:id/cancel — iptal sonrası status CANCELLED olur ve stoğu etkilemez', async () => {
    const before = await getQuantity();

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/orders/${cancelOrderId}/cancel`)
      .set('Authorization', subeMuduruAuthHeader)
      .expect(200);

    expect(res.body.status).toBe('CANCELLED');
    expect(await getQuantity()).toBe(before);
  });
});
