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

  // ── (b) Listeleme — tenant izolasyonu + sayfalama ───────────────────────────
  //
  // admin/tenants ve admin/errors ile aynı desen: {items,total,page,pageSize}.

  it('GET /products — yalnızca kendi tenant\'ının ürünleri döner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .set('Authorization', authHeader1)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(50);
    expect(res.body.items.some((p: { id: string }) => p.id === productId)).toBe(true);
    expect(res.body.items.some((p: { id: string }) => p.id === product2Id)).toBe(false);
    expect(res.body.items.every((p: { tenantId: string }) => p.tenantId === ctx1.tenantId)).toBe(true);
  });

  it('GET /products?pageSize=1&page=2 — ikinci sayfaya doğru geçer, total tüm eşleşen kayıt sayısını yansıtır', async () => {
    // ctx1'de şu ana kadar 1 ürün var (yukarıdaki (a)) — ikinci sayfaya
    // geçmeden önce en az 2 ürün olsun diye bir tane daha oluşturuluyor.
    const extraRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader1)
      .send({
        sku: `E2E-PROD1-EXTRA-${uniqueSuffix()}`,
        name: 'E2E Ürün 1 - İkinci',
        unit: 'adet',
        categoryId: categoryId1,
      })
      .expect(201);
    const extraProductId = extraRes.body.id;

    const page1 = await request(app.getHttpServer())
      .get('/api/v1/products')
      .query({ pageSize: 1, page: 1 })
      .set('Authorization', authHeader1)
      .expect(200);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.page).toBe(1);
    expect(page1.body.pageSize).toBe(1);
    expect(page1.body.total).toBeGreaterThanOrEqual(2);

    const page2 = await request(app.getHttpServer())
      .get('/api/v1/products')
      .query({ pageSize: 1, page: 2 })
      .set('Authorization', authHeader1)
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.page).toBe(2);
    // İki sayfa aynı ürünü tekrar döndürmemeli (orderBy: name asc ile tutarlı sıralama).
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);

    // Her iki ürün de (isim sırasına göre) sayfa 1 veya 2'de görünmüş olmalı.
    const seenIds = [page1.body.items[0].id, page2.body.items[0].id];
    expect(seenIds).toEqual(expect.arrayContaining([productId, extraProductId]));
  });

  it('GET /products?pageSize=101 — üst sınırı (100) aşan pageSize 400 döner', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/products')
      .query({ pageSize: 101 })
      .set('Authorization', authHeader1)
      .expect(400);
  });

  it('GET /products?search= — arama sayfalamayla birlikte doğru total döner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .query({ search: 'İkinci', pageSize: 50 })
      .set('Authorization', authHeader1)
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toContain('İkinci');
    expect(res.body.matchType).toBe('exact');
  });

  it('GET /products?search= — substring hiçbir şey bulamazsa fuzzy moda düşer ve öneri döner', async () => {
    const cocaColaRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader1)
      .send({
        sku: `E2E-PROD1-COLA-${uniqueSuffix()}`,
        name: 'Coca-Cola 1 Litre',
        unit: 'adet',
        categoryId: categoryId1,
      })
      .expect(201);
    const cocaColaId = cocaColaRes.body.id;

    // "Cola 1Litre" substring olarak "Coca-Cola 1 Litre" içinde geçmiyor
    // (tire/boşluk farkı), bu yüzden substring araması 0 sonuç dönmeli ve
    // fuzzy fallback devreye girmeli.
    const res = await request(app.getHttpServer())
      .get('/api/v1/products')
      .query({ search: 'Cola 1Litre' })
      .set('Authorization', authHeader1)
      .expect(200);

    expect(res.body.matchType).toBe('fuzzy');
    expect(res.body.items.some((p: { id: string }) => p.id === cocaColaId)).toBe(true);
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
