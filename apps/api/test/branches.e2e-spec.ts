/**
 * Şube yönetimi (branches.controller.ts) — CRUD, Agent kurulum akışı
 * (setup-code → Public agent-connect) ve entegrasyon durumu sorgusu.
 *
 * generateSetupToken() bir IntegrationAdapter.adapterType'ın DB'de
 * (isActive:true) mevcut olmasını istiyor; migration'da seed edilmediği
 * için (bkz. agent-sync.e2e-spec.ts'teki aynı gerekçe) test kendi adaptör
 * kaydını doğrudan Prisma ile oluşturuyor ve afterAll'da elle siliyor.
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

describe('Şube Yönetimi / Branches (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx1: SignedUpContext;
  let ctx2: SignedUpContext;
  let authHeader1: string;
  let authHeader2: string;
  let adapterType: string;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx1 = await signupAndGetContext(app);
    authHeader1 = `Bearer ${ctx1.accessToken}`;
    createdTaxNumbers.push(ctx1.payload.taxNumber);

    ctx2 = await signupAndGetContext(app);
    authHeader2 = `Bearer ${ctx2.accessToken}`;
    createdTaxNumbers.push(ctx2.payload.taxNumber);

    adapterType = `E2E_BRANCH_ADAPTER_${uniqueSuffix()}`;
    await prisma.integrationAdapter.create({
      data: {
        adapterType,
        displayName: 'E2E Test Adaptörü',
        webserviceType: 'REST',
        readEndpoint: '/mock/read',
        writeEndpoint: '/mock/write',
        authType: 'API_KEY',
        fieldMappings: {},
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await prisma.integrationAdapter.delete({ where: { adapterType } }).catch(() => undefined);
    await app.close();
  });

  // ── (a) Oluşturma ─────────────────────────────────────────────────────────

  let newBranchId: string;

  it('POST /branches — yeni şube doğru tenant\'a bağlanır', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', authHeader1)
      .send({ name: 'E2E İkinci Şube', slug: `e2e-branch-${uniqueSuffix()}` })
      .expect(201);

    expect(res.body.tenantId).toBe(ctx1.tenantId);
    newBranchId = res.body.id;
  });

  // ── (b) Listeleme — tenant izolasyonu ───────────────────────────────────

  it('GET /branches — yalnızca kendi tenant\'ının şubeleri döner, başkasınınki sızmaz', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', authHeader1)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2); // signup'taki + (a)'da açılan
    expect(res.body.every((b: { tenantId: string }) => b.tenantId === ctx1.tenantId)).toBe(true);
    expect(res.body.some((b: { id: string }) => b.id === ctx2.branchId)).toBe(false);
  });

  // ── (c) Güncelleme — tenant izolasyonu ───────────────────────────────────

  it('PATCH /branches/:id — kendi şubesini günceller', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/branches/${newBranchId}`)
      .set('Authorization', authHeader1)
      .send({ name: 'E2E İkinci Şube (güncellendi)' })
      .expect(200);

    expect(res.body.name).toBe('E2E İkinci Şube (güncellendi)');
  });

  it('PATCH /branches/:id — başka tenant\'ın şubesini güncelleme denemesi 404 döner', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/branches/${ctx2.branchId}`)
      .set('Authorization', authHeader1)
      .send({ name: 'Ele geçirilmiş şube adı' })
      .expect(404);

    // ctx2'nin şube adı değişmemiş olmalı.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/branches/${ctx2.branchId}`)
      .set('Authorization', authHeader2)
      .expect(200);
    expect(res.body.name).not.toBe('Ele geçirilmiş şube adı');
  });

  // ── (d) Agent kurulum kodu üretimi ───────────────────────────────────────

  let setupToken: string;

  it('POST /branches/:id/integration/setup-code — 8 karakterlik, [A-Z0-9] biçiminde benzersiz kod üretir', async () => {
    const res1 = await request(app.getHttpServer())
      .post(`/api/v1/branches/${newBranchId}/integration/setup-code`)
      .set('Authorization', authHeader1)
      .send({ adapterType })
      .expect(201);

    expect(res1.body.token).toMatch(/^[A-Z0-9]{8}$/);
    setupToken = res1.body.token;

    const res2 = await request(app.getHttpServer())
      .post(`/api/v1/branches/${newBranchId}/integration/setup-code`)
      .set('Authorization', authHeader1)
      .send({ adapterType })
      .expect(201);

    expect(res2.body.token).toMatch(/^[A-Z0-9]{8}$/);
    // Benzersizlik: iki ayrı üretim aynı kodu vermemeli.
    expect(res2.body.token).not.toBe(res1.body.token);
  });

  it('POST /branches/:id/integration/setup-code — başka tenant\'ın şubesi için kod üretilemez (404)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/branches/${ctx2.branchId}/integration/setup-code`)
      .set('Authorization', authHeader1)
      .send({ adapterType })
      .expect(404);
  });

  // ── (e) Public: Agent bağlanma ───────────────────────────────────────────

  it('POST /branches/agent-connect — Public, geçerli kodla başarıyla bağlanır', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/branches/agent-connect')
      .send({ token: setupToken, agentVersion: '1.0.0-e2e' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(typeof res.body.agentId).toBe('string');
    expect(typeof res.body.apiKey).toBe('string');

    const integrationRes = await request(app.getHttpServer())
      .get(`/api/v1/branches/${newBranchId}/integration`)
      .set('Authorization', authHeader1)
      .expect(200);
    expect(integrationRes.body.connectionStatus).toBe('CONNECTED');
    expect(integrationRes.body.adapterType).toBe(adapterType);
  });

  it('POST /branches/agent-connect — kullanılmış kod tekrar kabul edilmez (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/branches/agent-connect')
      .send({ token: setupToken, agentVersion: '1.0.0-e2e' })
      .expect(400);
  });

  it('POST /branches/agent-connect — geçersiz/uydurma kod reddedilir (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/branches/agent-connect')
      .send({ token: 'GECERSIZ', agentVersion: '1.0.0-e2e' })
      .expect(400);
  });

  it('POST /branches/agent-connect — başka tenant\'ın entegrasyon durumu sızmaz (404)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/branches/${newBranchId}/integration`)
      .set('Authorization', authHeader2)
      .expect(404);
  });

  // ── (f) Rate limit — brute-force koruması ────────────────────────────────
  //
  // @Throttle({limit:10, ttl:60_000}) — bu bütçeyi yukarıdaki testlerle
  // paylaşmamak için TAMAMEN AYRI bir Nest app örneği (kendi throttle
  // storage'ı) kullanılıyor.
  it('POST /branches/agent-connect — 60 saniyede >10 istek sonrası 429 döner (route-level throttle)', async () => {
    const { app: floodApp } = await createTestApp();
    try {
      let sawTooManyRequests = false;
      for (let i = 0; i < 12; i++) {
        const res = await request(floodApp.getHttpServer())
          .post('/api/v1/branches/agent-connect')
          .send({ token: `FLOOD${i}X`, agentVersion: '1.0.0-e2e' });
        if (res.status === 429) {
          sawTooManyRequests = true;
          break;
        }
      }
      expect(sawTooManyRequests).toBe(true);
    } finally {
      await floodApp.close();
    }
  });
});
