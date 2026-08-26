/**
 * StokPilot Agent senkronizasyonu (sync/agent.controller.ts, prefix '/agent')
 * — X-Agent-Id / X-Agent-Key ile API-key bazlı kimlik doğrulama (JWT/Roles
 * YOK, bkz. agent-auth.guard.ts). Bu yüzden diğer dosyalardaki authHeader
 * yerine burada agentHeaders (X-Agent-Id/X-Agent-Key) kullanılıyor.
 *
 * Gerçek bir Agent'a bağlanmak için önce PATRON bir kurulum kodu üretir
 * (POST /branches/:branchId/integration/setup-code), sonra Agent Public
 * POST /branches/agent-connect ile bu kodu apiKey'e çevirir — tıpkı
 * production akışındaki gibi (bkz. branches.service.ts). integration_adapters
 * tablosu boş geldiği için (migration'da seed yok) test kendi adapter kaydını
 * doğrudan Prisma ile oluşturuyor (RLS'siz global referans tablo — createCategory
 * ile aynı gerekçe) ve afterAll'da elle siliyor (cleanupTenants bu tabloyu
 * kapsamaz, tenantId kolonu yok).
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

describe('StokPilot Agent Senkronizasyonu (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: SignedUpContext;
  let ctx2: SignedUpContext;
  let authHeader: string;
  let adapterType: string;
  let agentId: string;
  let agentKey: string;
  // ctx2'ye bağlı İKİNCİ, ayrı bir Agent kimliği — tenant izolasyonu testleri
  // için (bir tenant'ın Agent'ı başka bir tenant'ın kaynaklarına erişemez).
  let agentId2: string;
  let agentKey2: string;

  const createdTaxNumbers: string[] = [];

  async function connectAgent(app: INestApplication, authHeader: string, branchId: string) {
    const setupRes = await request(app.getHttpServer())
      .post(`/api/v1/branches/${branchId}/integration/setup-code`)
      .set('Authorization', authHeader)
      .send({ adapterType })
      .expect(201);

    const connectRes = await request(app.getHttpServer())
      .post('/api/v1/branches/agent-connect')
      .send({ token: setupRes.body.token, agentVersion: '1.0.0-e2e' })
      .expect(200);

    return { agentId: connectRes.body.agentId as string, agentKey: connectRes.body.apiKey as string };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx = await signupAndGetContext(app);
    authHeader = `Bearer ${ctx.accessToken}`;
    createdTaxNumbers.push(ctx.payload.taxNumber);

    ctx2 = await signupAndGetContext(app);
    createdTaxNumbers.push(ctx2.payload.taxNumber);

    adapterType = `E2E_ADAPTER_${uniqueSuffix()}`;
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

    // Gerçek akış: PATRON kurulum kodu üretir → Agent (Public) bu kodla bağlanır.
    ({ agentId, agentKey } = await connectAgent(app, authHeader, ctx.branchId));
    ({ agentId: agentId2, agentKey: agentKey2 } = await connectAgent(
      app,
      `Bearer ${ctx2.accessToken}`,
      ctx2.branchId,
    ));
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await prisma.integrationAdapter.delete({ where: { adapterType } }).catch(() => undefined);
    await app.close();
  });

  function agentHeaders(id = agentId, key = agentKey) {
    return { 'X-Agent-Id': id, 'X-Agent-Key': key };
  }

  // ── (a) Kimlik doğrulama ─────────────────────────────────────────────────

  it('GET /agent/sync-queue — header eksikse 401 döner', async () => {
    await request(app.getHttpServer()).get('/api/v1/agent/sync-queue').expect(401);
  });

  it('GET /agent/sync-queue — geçersiz agentId 401 döner', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/agent/sync-queue')
      .set(agentHeaders('00000000-0000-0000-0000-000000000000', 'her-hangi-bir-anahtar'))
      .expect(401);
  });

  it('GET /agent/sync-queue — doğru agentId + yanlış anahtar 401 döner', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/agent/sync-queue')
      .set(agentHeaders(agentId, 'yanlis-anahtar'))
      .expect(401);
  });

  // ── (b) Kuyruk okuma ──────────────────────────────────────────────────────

  let queueItemId: string;

  it('GET /agent/sync-queue — geçerli API-key ile bekleyen kuyruk doğru döner', async () => {
    // REST üzerinden kuyruğa iş ekleyen bir uç nokta yok (yalnızca dahili
    // servisler — ör. orders.approve — enqueue ediyor); createCategory ile
    // aynı gerekçeyle doğrudan Prisma ile bir OUTBOUND iş ekleniyor.
    const created = await prisma.syncQueue.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        operationType: 'STOCK_READ',
        payload: { test: true },
        adapterType,
        status: 'PENDING',
      },
      select: { id: true },
    });
    queueItemId = created.id;

    const res = await request(app.getHttpServer())
      .get('/api/v1/agent/sync-queue')
      .set(agentHeaders())
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const item = res.body.find((j: { id: string }) => j.id === queueItemId);
    expect(item).toBeDefined();
    expect(item.operationType).toBe('STOCK_READ');
    expect(item.adapterType).toBe(adapterType);
  });

  // ── (c) Ack ───────────────────────────────────────────────────────────────

  it('POST /agent/sync-queue/:id/ack — iş doğru şekilde onaylanır (SUCCESS)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/agent/sync-queue/${queueItemId}/ack`)
      .set(agentHeaders())
      .send({ success: true })
      .expect(200);

    // Ack edilen iş artık PENDING/OUTBOUND kuyruğunda görünmemeli.
    const res = await request(app.getHttpServer())
      .get('/api/v1/agent/sync-queue')
      .set(agentHeaders())
      .expect(200);
    expect(res.body.some((j: { id: string }) => j.id === queueItemId)).toBe(false);

    // JWT tarafında da statü sayaçlarına yansımalı.
    const statusRes = await request(app.getHttpServer())
      .get(`/api/v1/sync/status/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(statusRes.body.success).toBeGreaterThanOrEqual(1);
  });

  it('POST /agent/sync-queue/:id/ack — var olmayan bir kuyruk id\'si 404 döner', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/agent/sync-queue/00000000-0000-0000-0000-000000000000/ack`)
      .set(agentHeaders())
      .send({ success: true })
      .expect(404);
  });

  it('POST /agent/sync-queue/:id/ack — başka tenant\'ın Agent\'ı bu işi ack edemez (404)', async () => {
    const created = await prisma.syncQueue.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        operationType: 'STOCK_READ',
        payload: { test: true },
        adapterType,
        status: 'PENDING',
      },
      select: { id: true },
    });

    // ackJob, id'yi agentin KENDİ (branchId, tenantId) bağlamıyla filtreler
    // (bkz. agent.service.ts) — job'un id'si doğru olsa bile başka bir
    // tenant'a ait Agent kimliğiyle sorgulanınca eşleşmemeli.
    await request(app.getHttpServer())
      .post(`/api/v1/agent/sync-queue/${created.id}/ack`)
      .set(agentHeaders(agentId2, agentKey2))
      .send({ success: true })
      .expect(404);

    // İşin hâlâ PENDING/dokunulmamış olduğunu, gerçek sahibi (ctx'in
    // Agent'ı) üzerinden doğrula.
    const res = await request(app.getHttpServer())
      .get('/api/v1/agent/sync-queue')
      .set(agentHeaders())
      .expect(200);
    expect(res.body.some((j: { id: string }) => j.id === created.id)).toBe(true);

    // Temizlik: bu işi de ack'leyip kapatalım ki queue temiz kalsın.
    await request(app.getHttpServer())
      .post(`/api/v1/agent/sync-queue/${created.id}/ack`)
      .set(agentHeaders())
      .send({ success: true })
      .expect(200);
  });

  // ── (d) Inbound sync — stok/fiyat güncelleme + tenant izolasyonu ────────

  it('POST /agent/inbound-sync — barkoda göre StockLevel ve salePrice doğru güncellenir', async () => {
    const barcode = `E2E-AGENT-BARCODE-${uniqueSuffix()}`;
    const category = await createCategory(prisma, ctx.tenantId, 'E2E Agent Kategorisi');

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader)
      .send({
        sku: `E2E-AGENT-${uniqueSuffix()}`,
        name: 'E2E Agent Ürünü',
        unit: 'adet',
        categoryId: category.id,
        barcode,
      })
      .expect(201);
    const productId = productRes.body.id;

    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId, items: [{ productId, quantity: 10 }] })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/agent/inbound-sync')
      .set(agentHeaders())
      .send({ products: [{ barcode, price: 55.5, stockQuantity: 42 }] })
      .expect(200);

    expect(res.body.updated).toBe(1);
    expect(res.body.notFound).toEqual([]);

    const productAfter = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(Number(productAfter.body.salePrice)).toBe(55.5);

    const stockAfter = await request(app.getHttpServer())
      .get(`/api/v1/stock/${ctx.branchId}/${productId}`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(Number(stockAfter.body.quantity)).toBe(42);
  });

  it('POST /agent/inbound-sync — tenant izolasyonu: aynı barkoda sahip başka bir tenant\'ın ürünü ETKİLENMEZ', async () => {
    const sharedBarcode = `E2E-AGENT-SHARED-${uniqueSuffix()}`;

    // ctx (agent'ın kendi tenant'ı) için barkodlu ürün + stok.
    const category1 = await createCategory(prisma, ctx.tenantId, 'E2E Agent Paylaşımlı Kategori 1');
    const product1Res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader)
      .send({
        sku: `E2E-AGENT-OWN-${uniqueSuffix()}`,
        name: 'E2E Agent Kendi Ürünü',
        unit: 'adet',
        categoryId: category1.id,
        barcode: sharedBarcode,
      })
      .expect(201);
    const product1Id = product1Res.body.id;
    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader)
      .send({ branchId: ctx.branchId, items: [{ productId: product1Id, quantity: 5 }] })
      .expect(201);

    // ctx2 (BAŞKA bir tenant) için AYNI barkoda sahip ayrı bir ürün + stok.
    const authHeader2 = `Bearer ${ctx2.accessToken}`;
    const category2 = await createCategory(prisma, ctx2.tenantId, 'E2E Agent Paylaşımlı Kategori 2');
    const product2Res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader2)
      .send({
        sku: `E2E-AGENT-OTHER-${uniqueSuffix()}`,
        name: 'E2E Agent Başka Tenant Ürünü',
        unit: 'adet',
        categoryId: category2.id,
        barcode: sharedBarcode,
      })
      .expect(201);
    const product2Id = product2Res.body.id;
    await request(app.getHttpServer())
      .post('/api/v1/stock/initialize')
      .set('Authorization', authHeader2)
      .send({ branchId: ctx2.branchId, items: [{ productId: product2Id, quantity: 7 }] })
      .expect(201);

    // ctx'in Agent'ı (X-Agent-Id/Key) bu barkodu inbound-sync ile günceller.
    await request(app.getHttpServer())
      .post('/api/v1/agent/inbound-sync')
      .set(agentHeaders())
      .send({ products: [{ barcode: sharedBarcode, price: 77.7, stockQuantity: 123 }] })
      .expect(200);

    // ctx'in KENDİ ürünü güncellenmiş olmalı.
    const stock1After = await request(app.getHttpServer())
      .get(`/api/v1/stock/${ctx.branchId}/${product1Id}`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(Number(stock1After.body.quantity)).toBe(123);

    // ctx2'nin AYNI barkodlu ürünü HİÇ etkilenmemiş olmalı.
    const product2After = await request(app.getHttpServer())
      .get(`/api/v1/products/${product2Id}`)
      .set('Authorization', authHeader2)
      .expect(200);
    expect(product2After.body.salePrice).toBeNull();

    const stock2After = await request(app.getHttpServer())
      .get(`/api/v1/stock/${ctx2.branchId}/${product2Id}`)
      .set('Authorization', authHeader2)
      .expect(200);
    expect(Number(stock2After.body.quantity)).toBe(7);
  });

  // ── (e) Heartbeat ─────────────────────────────────────────────────────────

  it('POST /agent/heartbeat — hata durumu doğru kaydedilir ve temizlenir', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/agent/heartbeat')
      .set(agentHeaders())
      .send({ status: 'düşük disk alanı' })
      .expect(200);

    const integrationRes = await request(app.getHttpServer())
      .get(`/api/v1/branches/${ctx.branchId}/integration`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(integrationRes.body.errorMessage).toBe('düşük disk alanı');

    // Boş status → sağlıklı sinyal → errorMessage temizlenir.
    await request(app.getHttpServer())
      .post('/api/v1/agent/heartbeat')
      .set(agentHeaders())
      .send({})
      .expect(200);

    const integrationRes2 = await request(app.getHttpServer())
      .get(`/api/v1/branches/${ctx.branchId}/integration`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(integrationRes2.body.errorMessage).toBeNull();
  });
});
