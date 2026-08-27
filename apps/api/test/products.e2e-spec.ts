/**
 * Ürün yönetimi (products.controller.ts) — oluşturma, listeleme, tekil
 * erişim ve koli/paket birimi güncellemesi. Hepsi tenant-scoped; kritik
 * kontrol tenant izolasyonu.
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

describe('Ürün Yönetimi / Products (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx1: SignedUpContext;
  let ctx2: SignedUpContext;
  let authHeader1: string;
  let authHeader2: string;
  let categoryId1: string;
  let product2Id: string;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx1 = await signupAndGetContext(app);
    authHeader1 = `Bearer ${ctx1.accessToken}`;
    createdTaxNumbers.push(ctx1.payload.taxNumber);

    ctx2 = await signupAndGetContext(app);
    authHeader2 = `Bearer ${ctx2.accessToken}`;
    createdTaxNumbers.push(ctx2.payload.taxNumber);

    categoryId1 = (await createCategory(prisma, ctx1.tenantId, 'E2E Ürün Kategorisi 1')).id;
    const categoryId2 = (await createCategory(prisma, ctx2.tenantId, 'E2E Ürün Kategorisi 2')).id;

    const product2Res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader2)
      .send({
        sku: `E2E-PROD2-${uniqueSuffix()}`,
        name: 'E2E Tenant2 Ürünü',
        unit: 'adet',
        categoryId: categoryId2,
      })
      .expect(201);
    product2Id = product2Res.body.id;
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  // ── (a) Oluşturma ─────────────────────────────────────────────────────────

  let productId: string;

  it('POST /products — yeni ürün doğru tenant\'a bağlanır', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader1)
      .send({
        sku: `E2E-PROD1-${uniqueSuffix()}`,
        name: 'E2E Ürün 1',
        unit: 'adet',
        categoryId: categoryId1,
      })
      .expect(201);

    expect(res.body.tenantId).toBe(ctx1.tenantId);
    expect(res.body.name).toBe('E2E Ürün 1');
    productId = res.body.id;
  });

  // ── (b) Listeleme — tenant izolasyonu ───────────────────────────────────

  it('GET /products — yalnızca kendi tenant\'ının ürünleri döner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', authHeader1)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((p: { id: string }) => p.id === productId)).toBe(true);
    expect(res.body.some((p: { id: string }) => p.id === product2Id)).toBe(false);
    expect(res.body.every((p: { tenantId: string }) => p.tenantId === ctx1.tenantId)).toBe(true);
  });

  // ── (c) Tekil erişim — tenant izolasyonu ─────────────────────────────────

  it('GET /products/:id — kendi ürününü görebilir', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', authHeader1)
      .expect(200);
    expect(res.body.id).toBe(productId);
  });

  it('GET /products/:id — başka tenant\'ın ürününe erişim 404 döner', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/products/${product2Id}`)
      .set('Authorization', authHeader1)
      .expect(404);
  });

  // ── (d) Koli/paket birimi güncelleme ─────────────────────────────────────

  it('PATCH /products/:id/units-per-case — doğru kaydedilir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/products/${productId}/units-per-case`)
      .set('Authorization', authHeader1)
      .send({ unitsPerCase: 12 })
      .expect(200);

    expect(res.body.unitsPerCase).toBe(12);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', authHeader1)
      .expect(200);
    expect(getRes.body.unitsPerCase).toBe(12);
  });

  it('PATCH /products/:id/units-per-case — başka tenant\'ın ürününü güncelleme denemesi 404 döner', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/products/${product2Id}/units-per-case`)
      .set('Authorization', authHeader1)
      .send({ unitsPerCase: 24 })
      .expect(404);
  });
});
