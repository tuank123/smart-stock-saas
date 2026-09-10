/**
 * Tedarikçi yönetimi (suppliers.controller.ts) — oluşturma, şubeye bağlama,
 * listeleme, tekil erişim ve güncelleme. Hepsi @Roles(PATRON, SUBE_MUDURU);
 * kritik kontrol tenant izolasyonu.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanupTenants,
  signupAndGetContext,
  uniqueSuffix,
  type SignedUpContext,
} from './setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Tedarikçi Yönetimi / Suppliers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx1: SignedUpContext;
  let ctx2: SignedUpContext;
  let authHeader1: string;
  let authHeader2: string;
  let supplier2Id: string;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx1 = await signupAndGetContext(app);
    authHeader1 = `Bearer ${ctx1.accessToken}`;
    createdTaxNumbers.push(ctx1.payload.taxNumber);

    ctx2 = await signupAndGetContext(app);
    authHeader2 = `Bearer ${ctx2.accessToken}`;
    createdTaxNumbers.push(ctx2.payload.taxNumber);

    const supplier2Res = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', authHeader2)
      .send({ name: `E2E Tenant2 Tedarikçi ${uniqueSuffix()}`, whatsappNumber: '+905550001122' })
      .expect(201);
    supplier2Id = supplier2Res.body.id;
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  // ── (a) Oluşturma ─────────────────────────────────────────────────────────

  let supplierId: string;

  it('POST /suppliers — yeni tedarikçi doğru tenant\'a bağlanır', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', authHeader1)
      .send({ name: `E2E Tedarikçi 1 ${uniqueSuffix()}`, whatsappNumber: '+905551112233' })
      .expect(201);

    expect(res.body.tenantId).toBe(ctx1.tenantId);
    supplierId = res.body.id;
  });

  // ── (b) Şubeye bağlama ────────────────────────────────────────────────────

  it('POST /suppliers/:supplierId/branches/:branchId — tedarikçiyi şubeye bağlar', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/suppliers/${supplierId}/branches/${ctx1.branchId}`)
      .set('Authorization', authHeader1)
      .send({ isPrimary: true })
      .expect(201);

    expect(res.body.supplier.name).toBeDefined();
    expect(res.body.branch.name).toBeDefined();
  });

  it('POST /suppliers/:supplierId/branches/:branchId — başka tenant\'ın şubesine bağlama denemesi 404 döner', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/suppliers/${supplierId}/branches/${ctx2.branchId}`)
      .set('Authorization', authHeader1)
      .send({ isPrimary: false })
      .expect(404);
  });

  // ── (c) Listeleme — tenant izolasyonu ───────────────────────────────────

  it('GET /suppliers — yalnızca kendi tenant\'ının tedarikçileri döner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/suppliers')
      .set('Authorization', authHeader1)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(50);
    expect(res.body.items.some((s: { id: string }) => s.id === supplierId)).toBe(true);
    expect(res.body.items.some((s: { id: string }) => s.id === supplier2Id)).toBe(false);
  });

  // ── (c-2) Listeleme — sayfalama ──────────────────────────────────────────
  //
  // admin/tenants, products, stock, orders, ocr, reports, transfers ile aynı
  // desen: {items,total,page,pageSize}.

  it('GET /suppliers?pageSize=1&page=2 — ikinci sayfaya doğru geçer, total tüm eşleşen kayıt sayısını yansıtır', async () => {
    const extraRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', authHeader1)
      .send({ name: `E2E Tedarikçi 1 Ekstra ${uniqueSuffix()}`, whatsappNumber: '+905551112244' })
      .expect(201);
    const extraSupplierId = extraRes.body.id;

    const page1 = await request(app.getHttpServer())
      .get('/api/v1/suppliers')
      .query({ pageSize: 1, page: 1 })
      .set('Authorization', authHeader1)
      .expect(200);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.total).toBeGreaterThanOrEqual(2);

    const page2 = await request(app.getHttpServer())
      .get('/api/v1/suppliers')
      .query({ pageSize: 1, page: 2 })
      .set('Authorization', authHeader1)
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.page).toBe(2);
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);

    const seenIds = [page1.body.items[0].id, page2.body.items[0].id];
    expect(seenIds).toEqual(expect.arrayContaining([supplierId, extraSupplierId]));
  });

  it('GET /suppliers?pageSize=101 — üst sınırı (100) aşan pageSize 400 döner', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/suppliers')
      .query({ pageSize: 101 })
      .set('Authorization', authHeader1)
      .expect(400);
  });

  // ── (d) Tekil erişim — tenant izolasyonu ─────────────────────────────────

  it('GET /suppliers/:id — kendi tedarikçisini görebilir', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/suppliers/${supplierId}`)
      .set('Authorization', authHeader1)
      .expect(200);
    expect(res.body.id).toBe(supplierId);
  });

  it('GET /suppliers/:id — başka tenant\'ın tedarikçisine erişim 404 döner', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/suppliers/${supplier2Id}`)
      .set('Authorization', authHeader1)
      .expect(404);
  });

  // ── (e) Güncelleme ────────────────────────────────────────────────────────

  it('PATCH /suppliers/:id — güncelleme doğru kaydedilir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/suppliers/${supplierId}`)
      .set('Authorization', authHeader1)
      .send({ contactName: 'Yeni İletişim Kişisi' })
      .expect(200);
    expect(res.body.contactName).toBe('Yeni İletişim Kişisi');
  });

  it('PATCH /suppliers/:id — hiçbir alan verilmezse 400 döner', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/suppliers/${supplierId}`)
      .set('Authorization', authHeader1)
      .send({})
      .expect(400);
  });

  it('PATCH /suppliers/:id — başka tenant\'ın tedarikçisini güncelleme denemesi 404 döner', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/suppliers/${supplier2Id}`)
      .set('Authorization', authHeader1)
      .send({ contactName: 'Ele geçirme denemesi' })
      .expect(404);
  });
});
