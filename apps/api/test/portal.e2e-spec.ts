/**
 * Tedarikçi Portalı (portal.controller.ts) — hem JWT'li yönetici uçları
 * (portal oluşturma, upload inceleme/onay/red) hem de kimlik doğrulamasız
 * (Public) tedarikçi tarafı uçları (info/otp/upload) aynı dosyada test
 * ediliyor, çünkü ikisi birbirine bağlı tek bir akış oluşturuyor.
 *
 * OTP_ENABLED=false (.env.test) → PortalService sabit MOCK_OTP='123456'
 * kullanıyor ve karşılaştırma Redis'e dokunmadan doğrudan yapılıyor — bu
 * yüzden testler Redis'e bağımlı değil (bkz. portal.service.ts sendOtp/
 * verifyOtp). Bu ayrıca "süresi geçmiş OTP" senaryosunun bu ortamda
 * deterministik olarak test edilemediği anlamına gelir (gerçek TTL/Redis
 * karşılaştırması yalnızca OTP_ENABLED=true iken devrede) — bkz. rapor notu.
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

const OTP_PHONE = '+905551234567';
const MOCK_OTP = '123456';

describe('Tedarikçi Portalı / Portal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: SignedUpContext;
  let ctx2: SignedUpContext;
  let authHeader: string;
  let authHeader2: string;
  let supplierId: string;
  let productId: string;
  let subdomain: string;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx = await signupAndGetContext(app);
    authHeader = `Bearer ${ctx.accessToken}`;
    createdTaxNumbers.push(ctx.payload.taxNumber);

    ctx2 = await signupAndGetContext(app);
    authHeader2 = `Bearer ${ctx2.accessToken}`;
    createdTaxNumbers.push(ctx2.payload.taxNumber);

    const supplierRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', authHeader)
      .send({ name: `E2E Portal Tedarikçi ${uniqueSuffix()}`, whatsappNumber: OTP_PHONE })
      .expect(201);
    supplierId = supplierRes.body.id;

    const category = await createCategory(prisma, ctx.tenantId, 'E2E Portal Kategorisi');

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader)
      .send({
        sku: `E2E-PORTAL-${uniqueSuffix()}`,
        name: 'E2E Portal Ürünü',
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

  // ── (a) Portal oluşturma ─────────────────────────────────────────────────

  it('POST /branches/:branchId/portal — portal ayarları doğru kaydedilir', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/branches/${ctx.branchId}/portal`)
      .set('Authorization', authHeader)
      .expect(201);

    expect(typeof res.body.subdomain).toBe('string');
    expect(res.body.portalUrl).toBe(`https://${res.body.subdomain}.stokpilot.com`);
    expect(typeof res.body.portalId).toBe('string');
    subdomain = res.body.subdomain;
  });

  // ── (b) Public: portal bilgisi ───────────────────────────────────────────

  it('GET /portal/:subdomain/info — Public, yalnızca sınırlı alanlar döner (tenantId/subdomain sızmaz)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portal/${subdomain}/info`)
      // Kasıtlı olarak Authorization header YOK — @Public() uç noktası.
      .expect(200);

    expect(res.body.portalActive).toBe(true);
    expect(res.body.branchName).toBe(ctx.payload.branchName);
    // Yalnızca bu iki alan dönmeli — tenantId, branchId, subdomain gibi
    // başka bir tenant'ı tanımlamaya yarayacak hiçbir şey sızmamalı.
    expect(Object.keys(res.body).sort()).toEqual(['branchName', 'portalActive']);
  });

  it('GET /portal/:subdomain/info — var olmayan subdomain 404 döner', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/portal/no-such-subdomain-${uniqueSuffix()}/info`)
      .expect(404);
  });

  // ── (c) Public: OTP akışı ─────────────────────────────────────────────────

  let sessionToken: string;

  it('POST /portal/:subdomain/otp/send — Public, 200 döner', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portal/${subdomain}/otp/send`)
      .send({ phone: OTP_PHONE })
      .expect(200);

    expect(res.body.message).toBeDefined();
  });

  it('POST /portal/:subdomain/otp/verify — yanlış OTP 401 döner', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/portal/${subdomain}/otp/verify`)
      .send({ phone: OTP_PHONE, otp: '000000' })
      .expect(401);
  });

  it('POST /portal/:subdomain/otp/verify — doğru OTP ile 200 + sessionToken döner', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portal/${subdomain}/otp/verify`)
      .send({ phone: OTP_PHONE, otp: MOCK_OTP })
      .expect(200);

    expect(res.body.verified).toBe(true);
    expect(typeof res.body.sessionToken).toBe('string');
    sessionToken = res.body.sessionToken;
  });

  // ── (d) Public: OTP doğrulanmadan upload yapılamaz ───────────────────────

  it('POST /portal/:subdomain/upload — geçersiz sessionToken ile 401 döner', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/portal/${subdomain}/upload`)
      .send({ phone: OTP_PHONE, sessionToken: 'gecersiz-bir-token', supplierId })
      .expect(401);
  });

  it('POST /portal/:subdomain/upload — sessionToken başka bir telefona ait olursa 401 döner', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/portal/${subdomain}/upload`)
      .send({ phone: '+905559998877', sessionToken, supplierId })
      .expect(401);
  });

  let uploadId: string;

  it('POST /portal/:subdomain/upload — doğrulanmış sessionToken ile 201 döner', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/portal/${subdomain}/upload`)
      .send({ phone: OTP_PHONE, sessionToken, supplierId })
      .expect(201);

    expect(typeof res.body.uploadId).toBe('string');
    expect(res.body.status).toBe('PENDING_REVIEW');
    uploadId = res.body.uploadId;
  });

  // ── (e) Fiyat kalemlerini düzenle + onayla → Product.salePrice yazılır ───

  const NEW_PRICE = 149.9;

  it('PATCH /portal/uploads/:uploadId/items — kalemler doğru kaydedilir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/portal/uploads/${uploadId}/items`)
      .set('Authorization', authHeader)
      .send({ items: [{ productId, newPrice: NEW_PRICE }] })
      .expect(200);

    const item = res.body.parsedItems.find((i: { productId: string }) => i.productId === productId);
    expect(item).toBeDefined();
    expect(item.newPrice).toBe(NEW_PRICE);
  });

  it('PATCH /portal/uploads/:uploadId/approve — onay Product.salePrice\'a gerçekten yazar', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/portal/uploads/${uploadId}/approve`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(res.body.status).toBe('APPROVED');

    const productRes = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(Number(productRes.body.salePrice)).toBe(NEW_PRICE);

    // PriceChangeLog da yazılmış olmalı (ilk atama: oldPrice=0, changePct=0).
    const logsRes = await request(app.getHttpServer())
      .get(`/api/v1/stock/price-changes/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .expect(200);
    const log = logsRes.body.find((l: { productId: string }) => l.productId === productId);
    expect(log).toBeDefined();
    expect(Number(log.newPrice)).toBe(NEW_PRICE);
  });

  // ── (f) Red edilen bir güncelleme salePrice'ı etkilemez ──────────────────

  it('PATCH /portal/uploads/:uploadId/reject — reddedilen fiyat Product.salePrice\'ı DEĞİŞTİRMEZ', async () => {
    const upload2Res = await request(app.getHttpServer())
      .post(`/api/v1/portal/${subdomain}/upload`)
      .send({ phone: OTP_PHONE, sessionToken, supplierId })
      .expect(201);
    const uploadId2 = upload2Res.body.uploadId;

    await request(app.getHttpServer())
      .patch(`/api/v1/portal/uploads/${uploadId2}/items`)
      .set('Authorization', authHeader)
      .send({ items: [{ productId, newPrice: 999 }] })
      .expect(200);

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/portal/uploads/${uploadId2}/reject`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(res.body.status).toBe('REJECTED');

    const productRes = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', authHeader)
      .expect(200);
    // Hâlâ (e)'de onaylanan fiyat — 999 DEĞİL.
    expect(Number(productRes.body.salePrice)).toBe(NEW_PRICE);
  });

  // ── (g) Tenant izolasyonu ─────────────────────────────────────────────────

  it('Başka bir tenant, ilk tenant\'ın portal upload\'ına erişemez (404)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/portal/uploads/detail/${uploadId}`)
      .set('Authorization', authHeader2)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/portal/uploads/${uploadId}/approve`)
      .set('Authorization', authHeader2)
      .expect(404);
  });
});
