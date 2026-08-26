/**
 * WhatsApp Fiyat (whatsapp.controller.ts) — Meta doğrulama handshake'i (GET
 * webhook) ve gelen mesaj işleme (POST webhook). İkisi de @Public(); JWT
 * gerektirmiyor.
 *
 * WHATSAPP_WEBHOOK_VERIFY_TOKEN .env.test'te tanımlı DEĞİL (yalnızca
 * .env.example'da örnek var), bu yüzden doğru handshake'i test edebilmek için
 * bu dosya createTestApp()'ten ÖNCE (modül üst seviyesinde) process.env'e
 * kendi test token'ını yazıyor — ConfigService bu değeri ilk okuduğunda
 * (AppModule derlenirken) devrede olması için import zamanında set ediliyor.
 */
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'e2e-test-verify-token';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as crypto from 'crypto';
import {
  createTestApp,
  cleanupTenants,
  createCategory,
  signupAndGetContext,
  uniqueSuffix,
  type SignedUpContext,
} from './setup';
import { PrismaService } from '../src/prisma/prisma.service';

const SUPPLIER_PHONE_E164 = '+905557778899';
// Meta'nın webhook'ta gönderdiği biçim — genelde '+' olmadan, ülke koduyla.
const SUPPLIER_PHONE_WEBHOOK = '905557778899';
const PRODUCT_NAME = `E2E Kaşar Peyniri ${Math.floor(Math.random() * 100000)}`;

function metaTextPayload(from: string, body: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ from, type: 'text', text: { body } }],
            },
          },
        ],
      },
    ],
  };
}

/**
 * Meta'nın X-Hub-Signature-256'sını taklit eder: HMAC-SHA256(WHATSAPP_APP_SECRET,
 * JSON.stringify(payload)). supertest'in `.send(obj)`'i Content-Type json iken
 * gövdeyi TAM OLARAK JSON.stringify(obj) ile serileştirir (superagent) — bu
 * yüzden imza da aynı stringify çağrısı üzerinden hesaplanmalı, aksi halde
 * sunucudaki req.rawBody ile burada imzalanan bytes eşleşmez.
 */
function signPayload(payload: unknown): string {
  const raw = JSON.stringify(payload);
  const hmac = crypto
    .createHmac('sha256', process.env.WHATSAPP_APP_SECRET!)
    .update(raw)
    .digest('hex');
  return `sha256=${hmac}`;
}

describe('WhatsApp Fiyat / Webhook (e2e)', () => {
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

    const supplierRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', authHeader)
      .send({ name: `E2E WhatsApp Tedarikçi ${uniqueSuffix()}`, whatsappNumber: SUPPLIER_PHONE_E164 })
      .expect(201);
    const supplierId = supplierRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/suppliers/${supplierId}/branches/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .send({ isPrimary: true })
      .expect(201);

    const category = await createCategory(prisma, ctx.tenantId, 'E2E WhatsApp Kategorisi');

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader)
      .send({
        sku: `E2E-WA-${uniqueSuffix()}`,
        name: PRODUCT_NAME,
        unit: 'adet',
        categoryId: category.id,
      })
      .expect(201);
    productId = productRes.body.id;
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  async function listPendingUploads() {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portal/uploads/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .expect(200);
    return res.body as { id: string; uploadType: string; parsedItems: unknown[] }[];
  }

  // ── (a) Doğrulama handshake'i (GET) ──────────────────────────────────────

  it('GET /whatsapp/webhook — doğru verify_token ile challenge\'ı aynen döner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/whatsapp/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'e2e-test-verify-token', 'hub.challenge': 'CHALLENGE-123' })
      .expect(200);

    expect(res.text).toBe('CHALLENGE-123');
  });

  it('GET /whatsapp/webhook — yanlış verify_token 403 döner', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/whatsapp/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'yanlis-token', 'hub.challenge': 'CHALLENGE-123' })
      .expect(403);
  });

  it('GET /whatsapp/webhook — hub.mode eksikse 403 döner', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/whatsapp/webhook')
      .query({ 'hub.verify_token': 'e2e-test-verify-token', 'hub.challenge': 'CHALLENGE-123' })
      .expect(403);
  });

  // ── (b) Bilinen tedarikçi + eşleşen fiyat satırı → upload tetiklenir ─────

  it('POST /whatsapp/webhook — bilinen tedarikçiden eşleşen ürün satırı PENDING_REVIEW upload oluşturur', async () => {
    const before = await listPendingUploads();
    const payload = metaTextPayload(SUPPLIER_PHONE_WEBHOOK, `${PRODUCT_NAME} - 12,50`);

    const res = await request(app.getHttpServer())
      .post('/api/v1/whatsapp/webhook')
      .set('X-Hub-Signature-256', signPayload(payload))
      .send(payload)
      .expect(200);
    expect(res.body.received).toBe(true);

    const after = await listPendingUploads();
    expect(after.length).toBe(before.length + 1);

    const created = after.find((u) => u.uploadType === 'WHATSAPP_PRICE_UPDATE');
    expect(created).toBeDefined();
    const item = (created!.parsedItems as { productId: string; newPrice: number }[]).find(
      (i) => i.productId === productId,
    );
    expect(item).toBeDefined();
    expect(item!.newPrice).toBe(12.5);
  });

  // ── (c) Bilinmeyen gönderen → sessizce yok sayılır (upload oluşmaz) ──────

  it('POST /whatsapp/webhook — kayıtlı olmayan numaradan mesaj sessizce yok sayılır, upload oluşturmaz', async () => {
    const before = await listPendingUploads();
    const payload = metaTextPayload('905000000000', `${PRODUCT_NAME} - 99,99`);

    await request(app.getHttpServer())
      .post('/api/v1/whatsapp/webhook')
      .set('X-Hub-Signature-256', signPayload(payload))
      .send(payload)
      .expect(200);

    const after = await listPendingUploads();
    expect(after.length).toBe(before.length);
  });

  // ── (d) Bozuk/beklenmeyen payload → çökmez, güvenle yok sayar ────────────
  // (Bu üçünde de imza DOĞRU — amaç payload şeklini test etmek, imzayı değil.)

  it('POST /whatsapp/webhook — boş obje 500 vermez, güvenle yok sayılır', async () => {
    const payload = {};
    await request(app.getHttpServer())
      .post('/api/v1/whatsapp/webhook')
      .set('X-Hub-Signature-256', signPayload(payload))
      .send(payload)
      .expect(200);
  });

  it('POST /whatsapp/webhook — eksik/yanlış şekilli payload (messages yok) 500 vermez', async () => {
    const payload = { entry: [{ changes: [{ value: {} }] }] };
    await request(app.getHttpServer())
      .post('/api/v1/whatsapp/webhook')
      .set('X-Hub-Signature-256', signPayload(payload))
      .send(payload)
      .expect(200);
  });

  it('POST /whatsapp/webhook — beklenmeyen tipte alanlar (sayı/dizi) içeren payload 500 vermez', async () => {
    const payload = { entry: [{ changes: [{ value: { messages: [{ from: 12345, type: 'text', text: { body: 42 } }] } }] }] };
    await request(app.getHttpServer())
      .post('/api/v1/whatsapp/webhook')
      .set('X-Hub-Signature-256', signPayload(payload))
      .send(payload)
      .expect(200);
  });

  // ── (e) İmza doğrulaması ──────────────────────────────────────────────────

  it('POST /whatsapp/webhook — X-Hub-Signature-256 header yoksa 401 döner, upload OLUŞTURMAZ', async () => {
    const before = await listPendingUploads();
    const payload = metaTextPayload(SUPPLIER_PHONE_WEBHOOK, `${PRODUCT_NAME} - 55,00`);

    await request(app.getHttpServer())
      .post('/api/v1/whatsapp/webhook')
      // Kasıtlı olarak İmza header'ı YOK.
      .send(payload)
      .expect(401);

    const after = await listPendingUploads();
    expect(after.length).toBe(before.length);
  });

  it('POST /whatsapp/webhook — yanlış imza 401 döner, upload OLUŞTURMAZ (işlenmez)', async () => {
    const before = await listPendingUploads();
    const payload = metaTextPayload(SUPPLIER_PHONE_WEBHOOK, `${PRODUCT_NAME} - 55,00`);

    await request(app.getHttpServer())
      .post('/api/v1/whatsapp/webhook')
      .set('X-Hub-Signature-256', 'sha256=' + '0'.repeat(64))
      .send(payload)
      .expect(401);

    const after = await listPendingUploads();
    expect(after.length).toBe(before.length);
  });

  it('POST /whatsapp/webhook — başka bir payload için üretilmiş (geçerli ama uyumsuz) imza 401 döner', async () => {
    const before = await listPendingUploads();
    const realPayload = metaTextPayload(SUPPLIER_PHONE_WEBHOOK, `${PRODUCT_NAME} - 55,00`);
    const otherPayload = metaTextPayload(SUPPLIER_PHONE_WEBHOOK, `${PRODUCT_NAME} - 1,00`);

    await request(app.getHttpServer())
      .post('/api/v1/whatsapp/webhook')
      // otherPayload için hesaplanmış bir imzayı realPayload ile gönder.
      .set('X-Hub-Signature-256', signPayload(otherPayload))
      .send(realPayload)
      .expect(401);

    const after = await listPendingUploads();
    expect(after.length).toBe(before.length);
  });
});
