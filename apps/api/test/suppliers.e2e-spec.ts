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

    expect(res.body.some((s: { id: string }) => s.id === supplierId)).toBe(true);
    expect(res.body.some((s: { id: string }) => s.id === supplier2Id)).toBe(false);
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
