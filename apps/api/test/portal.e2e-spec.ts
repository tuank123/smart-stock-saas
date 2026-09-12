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
    // İlk kayıtta supplierPrice = newPrice ile aynı (henüz "orijinal" olarak donuyor).
    expect(item.supplierPrice).toBe(NEW_PRICE);
  });

  it('PATCH /portal/uploads/:uploadId/items — supplierPrice (orijinal tedarikçi fiyatı) art arda kayıtlarda ASLA değişmez, yalnızca newPrice güncellenir', async () => {
    // Ayrı/izole bir upload — bu testin mutasyonları paylaşılan uploadId'nin
    // (approve/reject testlerinin bel bağladığı) durumunu bozmasın diye.
    const freshRes = await request(app.getHttpServer())
      .post(`/api/v1/portal/${subdomain}/upload`)
      .send({ phone: OTP_PHONE, sessionToken, supplierId })
      .expect(201);
    const freshUploadId = freshRes.body.uploadId;

    const FIRST_PRICE = 88;
    const first = await request(app.getHttpServer())
      .patch(`/api/v1/portal/uploads/${freshUploadId}/items`)
      .set('Authorization', authHeader)
      .send({ items: [{ productId, newPrice: FIRST_PRICE }] })
      .expect(200);
    const firstItem = first.body.parsedItems.find((i: { productId: string }) => i.productId === productId);
    expect(firstItem.newPrice).toBe(FIRST_PRICE);
    expect(firstItem.supplierPrice).toBe(FIRST_PRICE); // ilk kayıtta = newPrice

    const SECOND_PRICE = 125;
    const second = await request(app.getHttpServer())
      .patch(`/api/v1/portal/uploads/${freshUploadId}/items`)
      .set('Authorization', authHeader)
      .send({ items: [{ productId, newPrice: SECOND_PRICE }] })
      .expect(200);
    const secondItem = second.body.parsedItems.find((i: { productId: string }) => i.productId === productId);
    expect(secondItem.newPrice).toBe(SECOND_PRICE); // güncellendi
    expect(secondItem.supplierPrice).toBe(FIRST_PRICE); // ama donuk — hâlâ İLK değer
  });

  it('PATCH /portal/uploads/:uploadId/items — discountPct:null gönderilirse önceki indirim geri GELMEZ (sessiz kirlenme yok)', async () => {
    const freshRes = await request(app.getHttpServer())
      .post(`/api/v1/portal/${subdomain}/upload`)
      .send({ phone: OTP_PHONE, sessionToken, supplierId })
      .expect(201);
    const freshUploadId = freshRes.body.uploadId;

    // Önce bir indirim tanımlanıp kaydediliyor.
    const withDiscount = await request(app.getHttpServer())
      .patch(`/api/v1/portal/uploads/${freshUploadId}/items`)
      .set('Authorization', authHeader)
      .send({ items: [{ productId, newPrice: 200, discountPct: 10 }] })
      .expect(200);
    const itemWithDiscount = withDiscount.body.parsedItems.find(
      (i: { productId: string }) => i.productId === productId,
    );
    expect(itemWithDiscount.discountPct).toBe(10);

    // Frontend, fiyat alanı değiştiğinde indirimi KESİN olarak null gönderir
    // (bkz. duzenle/page.tsx) — "gönderilmezse mevcut değeri koru" fallback'i
    // burada devreye GİRMEMELİ, sessizce eski %10 geri gelmemeli.
    const cleared = await request(app.getHttpServer())
      .patch(`/api/v1/portal/uploads/${freshUploadId}/items`)
      .set('Authorization', authHeader)
      .send({ items: [{ productId, newPrice: 250, discountPct: null }] })
      .expect(200);
    const itemCleared = cleared.body.parsedItems.find(
      (i: { productId: string }) => i.productId === productId,
    );
    expect(itemCleared.newPrice).toBe(250);
    expect(itemCleared.discountPct).toBeNull();
  });

  let approvedReviewedBy: string;
  let approvedReviewedAt: string;

  it('PATCH /portal/uploads/:uploadId/approve — onay Product.salePrice\'a gerçekten yazar', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/portal/uploads/${uploadId}/approve`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(res.body.status).toBe('APPROVED');
    approvedReviewedBy = res.body.reviewedBy;
    approvedReviewedAt = res.body.reviewedAt;

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

  // enqueueSyncAfterPriceUpdate fire-and-forget'tir (ana yanıtı bloklamaz) —
  // sync_queue satırı transaction commit'ten hemen sonra, ama HTTP yanıtından
  // biraz sonra yazılabilir. scheduled-jobs.e2e-spec.ts'teki waitForErrorLogCount
  // ile aynı kısa polling deseni.
  async function waitForSyncQueueRow(
    where: { tenantId: string; branchId: string; operationType: string },
    timeoutMs = 1000,
  ) {
    const start = Date.now();
    for (;;) {
      const row = await prisma.syncQueue.findFirst({ where, orderBy: { createdAt: 'desc' } });
      if (row || Date.now() - start > timeoutMs) return row;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  it('PATCH /portal/uploads/:uploadId/approve — sync_queue\'ya PRICE_UPDATE kaydı yazar (stok miktarı değişikliklerindeki AYNI desen)', async () => {
    const row = await waitForSyncQueueRow({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      operationType: 'PRICE_UPDATE',
    });

    expect(row).toBeDefined();
    expect(row?.status).toBe('PENDING');
    expect(row?.direction).toBe('OUTBOUND');
    expect(row?.createdBy).toBe(approvedReviewedBy);
    const payload = row?.payload as {
      uploadId: string;
      productId: string;
      oldPrice: number | null;
      newPrice: number;
    };
    expect(payload.uploadId).toBe(uploadId);
    expect(payload.productId).toBe(productId);
    expect(payload.newPrice).toBe(NEW_PRICE);
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

  // ── (h) Onaylanmış bir listeyi düzenleme — "Güncel Fiyat Listeleri" ──────
  //
  // uploadId bu noktada APPROVED (test (e)'de onaylandı, salePrice=NEW_PRICE).
  // PENDING_REVIEW'da "Kaydet" yalnızca taslağı günceller (gerçek fiyata
  // dokunmaz — bkz. (d) testi); APPROVED'da ise artık gerçek fiyatı da
  // uygulamalı, ama status/reviewedBy/reviewedAt'a DOKUNMAMALI.

  const EDITED_PRICE = 179.5;

  it('PATCH /portal/uploads/:uploadId/items — APPROVED kayıtta gerçek Product.salePrice\'ı da günceller, status/reviewedBy/reviewedAt DEĞİŞMEZ', async () => {
    const beforeLogCount = (
      await request(app.getHttpServer())
        .get(`/api/v1/stock/price-changes/${ctx.branchId}`)
        .set('Authorization', authHeader)
        .expect(200)
    ).body.length;

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/portal/uploads/${uploadId}/items`)
      .set('Authorization', authHeader)
      .send({ items: [{ productId, newPrice: EDITED_PRICE }] })
      .expect(200);

    // Kayıt sessizce ikinci bir onaya düşmemeli.
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.reviewedBy).toBe(approvedReviewedBy);
    expect(res.body.reviewedAt).toBe(approvedReviewedAt);

    // Ama gerçek satış fiyatı artık EDITED_PRICE olmalı (NEW_PRICE değil).
    const productRes = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(Number(productRes.body.salePrice)).toBe(EDITED_PRICE);

    // Yeni bir PriceChangeLog kaydı (oldPrice=NEW_PRICE, newPrice=EDITED_PRICE)
    // eklenmiş olmalı — mevcut loglar silinmez, üzerine eklenir.
    const logsRes = await request(app.getHttpServer())
      .get(`/api/v1/stock/price-changes/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(logsRes.body.length).toBe(beforeLogCount + 1);
    const newestLog = logsRes.body[0];
    expect(newestLog.productId).toBe(productId);
    expect(Number(newestLog.oldPrice)).toBe(NEW_PRICE);
    expect(Number(newestLog.newPrice)).toBe(EDITED_PRICE);
  });

  it('PATCH /portal/uploads/:uploadId/items — APPROVED kayıtta da sync_queue\'ya YENİ bir PRICE_UPDATE kaydı yazar', async () => {
    const row = await waitForSyncQueueRow({
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      operationType: 'PRICE_UPDATE',
    });

    expect(row).toBeDefined();
    const payload = row?.payload as {
      uploadId: string;
      productId: string;
      oldPrice: number | null;
      newPrice: number;
    };
    // (e)'deki testten farklı bir kayıt: bu kez EDITED_PRICE'ı yansıtmalı.
    expect(payload.uploadId).toBe(uploadId);
    expect(payload.productId).toBe(productId);
    expect(payload.oldPrice).toBe(NEW_PRICE);
    expect(payload.newPrice).toBe(EDITED_PRICE);
  });

  it('PATCH /portal/uploads/:uploadId/items — PENDING_REVIEW kayıtta eski davranış korunur (gerçek fiyat DEĞİŞMEZ)', async () => {
    const draftRes = await request(app.getHttpServer())
      .post(`/api/v1/portal/${subdomain}/upload`)
      .send({ phone: OTP_PHONE, sessionToken, supplierId })
      .expect(201);
    const draftUploadId = draftRes.body.uploadId;
    expect(draftRes.body.status).toBe('PENDING_REVIEW');

    const beforeSalePrice = (
      await request(app.getHttpServer())
        .get(`/api/v1/products/${productId}`)
        .set('Authorization', authHeader)
        .expect(200)
    ).body.salePrice;

    await request(app.getHttpServer())
      .patch(`/api/v1/portal/uploads/${draftUploadId}/items`)
      .set('Authorization', authHeader)
      .send({ items: [{ productId, newPrice: 555 }] })
      .expect(200);

    const productRes = await request(app.getHttpServer())
      .get(`/api/v1/products/${productId}`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(productRes.body.salePrice).toBe(beforeSalePrice);
  });

  // ── (i) listUploads — status query parametresi ───────────────────────────

  it('GET /portal/uploads/:branchId — status verilmezse mevcut davranış: yalnızca PENDING_REVIEW döner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portal/uploads/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(res.body.every((u: { status: string }) => u.status === 'PENDING_REVIEW')).toBe(true);
    // uploadId (APPROVED) bu listede OLMAMALI.
    expect(res.body.some((u: { id: string }) => u.id === uploadId)).toBe(false);
  });

  it('GET /portal/uploads/:branchId?status=APPROVED — yalnızca onaylanmış kayıtları döner', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/portal/uploads/${ctx.branchId}`)
      .query({ status: 'APPROVED' })
      .set('Authorization', authHeader)
      .expect(200);

    expect(res.body.every((u: { status: string }) => u.status === 'APPROVED')).toBe(true);
    expect(res.body.some((u: { id: string }) => u.id === uploadId)).toBe(true);
  });
});
