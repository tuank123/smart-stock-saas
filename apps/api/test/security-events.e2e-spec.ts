/**
 * Güvenlik-hassas reddetme olaylarının admin panelinde görünür olması
 * (ErrorLog source:'SECURITY_EVENT') — all-exceptions.filter.ts'in genel
 * ">=500 dışını kaydetme" davranışı DEĞİŞTİRİLMEDEN, her hassas guard/akış
 * kendi reddetme noktasında SecurityEventLogger ile ayrıca logluyor.
 *
 * Bu dosya yalnızca dört SENARYOYU kapsıyor (görevde istenen): başarısız
 * login, geçersiz Agent API-key, rate-limit tetiklenmesi, ve şifrenin HİÇBİR
 * SECURITY_EVENT kaydında yer almadığının doğrulanması. FORBIDDEN_ROLE/
 * TENANT_CONTEXT_MISSING/WHATSAPP_SIGNATURE_INVALID/JWT_REJECTED zaten diğer
 * spec dosyalarındaki (admin/reports/staff-registration/whatsapp/...) 401/403
 * testleri sırasında dolaylı olarak üretiliyor ve son testte (regresyon
 * taraması) örtük şekilde kontrol ediliyor.
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

interface SecurityEventItem {
  id: string;
  source: string;
  severity: string;
  message: string;
  tenantId: string | null;
  context: Record<string, unknown> | null;
}

describe('Güvenlik Olayları / Security Events (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx1: SignedUpContext;
  let superAdminAuthHeader: string;

  const createdTaxNumbers: string[] = [];
  // Bu dosyanın kendi ürettiği başarısız-login şifresi — regresyon testinde
  // HİÇBİR ErrorLog kaydında görünmediği doğrulanacak.
  const SECRET_PASSWORD = `SecretPass${uniqueSuffix()}999`;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx1 = await signupAndGetContext(app);
    createdTaxNumbers.push(ctx1.payload.taxNumber);

    const superAdmin = await createRoleUser(app, prisma, {
      tenantId: ctx1.tenantId,
      branchId: null,
      role: UserRole.SUPER_ADMIN,
    });
    superAdminAuthHeader = `Bearer ${superAdmin.accessToken}`;
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  async function listSecurityEvents(eventType?: string): Promise<SecurityEventItem[]> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/errors')
      .set('Authorization', superAdminAuthHeader)
      .query({ source: 'SECURITY_EVENT', pageSize: 100 })
      .expect(200);
    const items = res.body.items as SecurityEventItem[];
    return eventType ? items.filter((i) => i.context?.eventType === eventType) : items;
  }

  // SecurityEventLogger.log() BİLEREK fire-and-forget'tir (production
  // davranışı — bkz. security-event.service.ts doc yorumu: "request akışını
  // ASLA bloklamaz"). Bu yüzden tetikleyen isteğin yanıtı döndüğü anda
  // ErrorLog satırının commit edilmiş olacağının garantisi yok — yerelde
  // (düşük gecikmeli loopback Postgres) bu yarış neredeyse hiç kaybedilmez,
  // ama CI'nin konteyner ağı üzerindeki daha yüksek/değişken gecikme
  // altında ara sıra kaybedilir (bkz. 2026-09-16 CI koşusu: aynı dosya bir
  // önceki koşuda değişikliksiz geçmişti). Düzeltme PRODUCTION kodunu değil,
  // yalnızca bu testin OKUMA tarafını değiştiriyor: beklenen olayı bulana
  // kadar kısa aralıklarla birkaç kez tekrar dener. Başarı durumunda (yazım
  // zaten tamamlanmışsa) ek gecikme ~0'dır — yalnızca en kötü senaryoda
  // ~600ms'ye kadar çıkar.
  async function waitForSecurityEvent(
    eventType: string,
    predicate: (e: SecurityEventItem) => boolean,
    { attempts = 5, delayMs = 150 }: { attempts?: number; delayMs?: number } = {},
  ): Promise<SecurityEventItem[]> {
    let events: SecurityEventItem[] = [];
    for (let i = 0; i < attempts; i++) {
      events = await listSecurityEvents(eventType);
      if (events.some(predicate)) return events;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return events;
  }

  // ── (a) Başarısız login ────────────────────────────────────────────────

  it('POST /auth/login — başarısız denemeden sonra SECURITY_EVENT (LOGIN_FAILED) kaydı oluşur', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ctx1.payload.email, password: SECRET_PASSWORD })
      .expect(401);

    const events = await listSecurityEvents('LOGIN_FAILED');
    const match = events.find((e) => e.context?.email === ctx1.payload.email);
    expect(match).toBeDefined();
    expect(match!.severity).toBe('WARNING');
    // Şifre bu kayıtta ASLA görünmemeli.
    expect(JSON.stringify(match)).not.toContain(SECRET_PASSWORD);
  });

  // ── (b) Geçersiz Agent API-key denemesi ──────────────────────────────────

  it('GET /agent/sync-queue — geçersiz Agent kimliği sonrası SECURITY_EVENT (INVALID_AGENT_KEY) kaydı oluşur', async () => {
    const fakeAgentId = '00000000-0000-0000-0000-000000000000';

    await request(app.getHttpServer())
      .get('/api/v1/agent/sync-queue')
      .set('X-Agent-Id', fakeAgentId)
      .set('X-Agent-Key', 'uydurma-anahtar-' + uniqueSuffix())
      .expect(401);

    const events = await waitForSecurityEvent(
      'INVALID_AGENT_KEY',
      (e) => e.context?.agentId === fakeAgentId,
    );
    expect(events.some((e) => e.context?.agentId === fakeAgentId)).toBe(true);
  });

  // ── (c) Rate-limit tetiklenmesi ───────────────────────────────────────────
  //
  // @Throttle({limit:10, ttl:60_000}) — bu bütçeyi diğer testlerle
  // paylaşmamak için TAMAMEN AYRI bir Nest app örneği (kendi throttle
  // storage'ı) kullanılıyor; aynı veritabanına yazdığı için oluşan ErrorLog
  // ana `app` üzerinden de görünür.
  it('POST /branches/agent-connect — rate-limit tetiklenince SECURITY_EVENT (RATE_LIMITED) kaydı oluşur', async () => {
    const { app: floodApp } = await createTestApp();
    try {
      let sawTooManyRequests = false;
      for (let i = 0; i < 12; i++) {
        const res = await request(floodApp.getHttpServer())
          .post('/api/v1/branches/agent-connect')
          .send({ token: `SECFLOOD${i}X`, agentVersion: '1.0.0-e2e' });
        if (res.status === 429) {
          sawTooManyRequests = true;
          break;
        }
      }
      expect(sawTooManyRequests).toBe(true);
    } finally {
      await floodApp.close();
    }

    const events = await listSecurityEvents('RATE_LIMITED');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].context?.path).toContain('/branches/agent-connect');
  });

  // ── (d) Regresyon: şifre HİÇBİR SECURITY_EVENT kaydında yer almaz ────────

  it('Hiçbir SECURITY_EVENT kaydında şifre metni ya da "password" alanı yer almaz', async () => {
    const events = await listSecurityEvents();
    expect(events.length).toBeGreaterThan(0);

    const raw = JSON.stringify(events);
    expect(raw).not.toContain(SECRET_PASSWORD);
    expect(raw).not.toContain(ctx1.payload.password);

    for (const e of events) {
      const contextKeys = Object.keys(e.context ?? {}).map((k) => k.toLowerCase());
      expect(contextKeys).not.toContain('password');
      expect(contextKeys).not.toContain('currentpassword');
      expect(contextKeys).not.toContain('newpassword');
      expect(contextKeys).not.toContain('apikey');
    }
  });

  // ── (e) assertTenantOwnership — CROSS_TENANT_ACCESS_ATTEMPT ─────────────
  //
  // orders.service.ts, bu görevde assertTenantOwnership() ile donatılan
  // servislerden biri (bkz. rapor). "var ama başka tenant'a ait" (gerçek
  // cross-tenant deneme) ile "gerçekten yok" (yanlış ID) davranışının
  // dışarıdan İKİSİ DE 404 olduğunu, ama yalnızca BİRİNCİSİNİN ErrorLog'a
  // yazdığını (yanlış pozitif YOK) doğruluyor.
  describe('CROSS_TENANT_ACCESS_ATTEMPT — assertTenantOwnership regresyonu', () => {
    let ctx2: SignedUpContext;
    let subeAuthHeader1: string;
    let foreignOrderId: string;

    beforeAll(async () => {
      ctx2 = await signupAndGetContext(app);
      createdTaxNumbers.push(ctx2.payload.taxNumber);

      const subeMuduru1 = await createRoleUser(app, prisma, {
        tenantId: ctx1.tenantId,
        branchId: ctx1.branchId,
        role: UserRole.SUBE_MUDURU,
      });
      subeAuthHeader1 = `Bearer ${subeMuduru1.accessToken}`;

      // ctx2'de (BAŞKA bir tenant) bir sipariş oluştur — ctx1'in
      // SUBE_MUDURU'sü bunu hedef alacak.
      const subeMuduru2 = await createRoleUser(app, prisma, {
        tenantId: ctx2.tenantId,
        branchId: ctx2.branchId,
        role: UserRole.SUBE_MUDURU,
      });
      const authHeader2 = `Bearer ${ctx2.accessToken}`;
      const subeAuthHeader2 = `Bearer ${subeMuduru2.accessToken}`;

      const supplierRes = await request(app.getHttpServer())
        .post('/api/v1/suppliers')
        .set('Authorization', authHeader2)
        .send({ name: `E2E CrossTenant Tedarikçi ${uniqueSuffix()}`, whatsappNumber: '+905552223344' })
        .expect(201);

      const category = await createCategory(prisma, ctx2.tenantId, 'E2E CrossTenant Kategorisi');
      const productRes = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', authHeader2)
        .send({
          sku: `E2E-XT-${uniqueSuffix()}`,
          name: 'E2E CrossTenant Ürünü',
          unit: 'adet',
          categoryId: category.id,
        })
        .expect(201);

      const orderRes = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', subeAuthHeader2)
        .send({
          branchId: ctx2.branchId,
          supplierId: supplierRes.body.id,
          items: [{ productId: productRes.body.id, quantityOrdered: 5 }],
        })
        .expect(201);
      foreignOrderId = orderRes.body.id;
    });

    it('Başka bir tenant\'ın siparişine erişim denemesi 404 döner VE CROSS_TENANT_ACCESS_ATTEMPT loglanır', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${foreignOrderId}/approve`)
        .set('Authorization', subeAuthHeader1)
        .expect(404);

      const events = await waitForSecurityEvent(
        'CROSS_TENANT_ACCESS_ATTEMPT',
        (e) => e.context?.resourceId === foreignOrderId,
      );
      const match = events.find((e) => e.context?.resourceId === foreignOrderId);
      expect(match).toBeDefined();
      expect(match!.context?.resourceType).toBe('PurchaseOrder');
      // Loglanan tenantId (üst seviye kolon), DENEYEN kullanıcının kendi
      // tenant'ı olmalı — gerçek sahibinin (ctx2) tenantId'si HİÇ görünmemeli.
      expect(match!.tenantId).toBe(ctx1.tenantId);
      expect(match!.tenantId).not.toBe(ctx2.tenantId);
      expect(JSON.stringify(match)).not.toContain(ctx2.tenantId);
    });

    it('Gerçekten var olmayan bir sipariş ID\'siyle denendiğinde 404 döner ama HİÇBİR SecurityEvent oluşmaz (yanlış pozitif yok)', async () => {
      const fakeOrderId = '99999999-9999-4999-8999-999999999999';

      const before = await listSecurityEvents('CROSS_TENANT_ACCESS_ATTEMPT');
      expect(before.some((e) => e.context?.resourceId === fakeOrderId)).toBe(false);

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${fakeOrderId}/approve`)
        .set('Authorization', subeAuthHeader1)
        .expect(404);

      const after = await listSecurityEvents('CROSS_TENANT_ACCESS_ATTEMPT');
      expect(after.some((e) => e.context?.resourceId === fakeOrderId)).toBe(false);
      // Toplam CROSS_TENANT_ACCESS_ATTEMPT sayısı da artmamalı.
      expect(after.length).toBe(before.length);
    });

    // debts.service.ts — daha önce (Faz 2'nin bir sonraki adımına kadar) BU
    // MODÜLDE hiçbir tenant kontrolü yoktu (bkz. debts.e2e-spec.ts'teki
    // ayrıntılı rapor). Diğer sekiz servisten farklı olarak debts, PATRON
    // (STARTER plan) rolüyle çalışıyor — SUBE_MUDURU gerekmiyor.
    it('Başka bir tenant\'ın borcuna erişim denemesi 404 döner VE CROSS_TENANT_ACCESS_ATTEMPT loglanır (debts.service.ts)', async () => {
      const authHeader2 = `Bearer ${ctx2.accessToken}`;
      const supplierRes = await request(app.getHttpServer())
        .post('/api/v1/suppliers')
        .set('Authorization', authHeader2)
        .send({ name: `E2E CrossTenant Debt Tedarikçi ${uniqueSuffix()}`, whatsappNumber: '+905553334455' })
        .expect(201);

      const debtRes = await request(app.getHttpServer())
        .post(`/api/v1/debts/${ctx2.branchId}`)
        .set('Authorization', authHeader2)
        .send({ supplierId: supplierRes.body.id, direction: 'PAYABLE', debtType: 'CASH', amount: 250 })
        .expect(201);
      const foreignDebtId = debtRes.body.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/debts/${foreignDebtId}`)
        .set('Authorization', `Bearer ${ctx1.accessToken}`)
        .send({ notes: 'Ele geçirme denemesi' })
        .expect(404);

      const events = await waitForSecurityEvent(
        'CROSS_TENANT_ACCESS_ATTEMPT',
        (e) => e.context?.resourceId === foreignDebtId,
      );
      const match = events.find((e) => e.context?.resourceId === foreignDebtId);
      expect(match).toBeDefined();
      expect(match!.context?.resourceType).toBe('Debt');
      expect(match!.tenantId).toBe(ctx1.tenantId);
      expect(JSON.stringify(match)).not.toContain(ctx2.tenantId);
    });

    // stock.service.ts — bu 10 raw-check migrasyonundan biri (getStockLevel).
    // StockLevel'ın kendi RLS'i YOK (yalnızca tenants/users/branches/
    // staff_registration_tokens'ta var), bu yüzden tenantId eşleşmesi
    // TAMAMEN bu assertTenantOwnership çağrısına bağlı.
    it('Başka bir tenant\'ın stok kaydına erişim denemesi 404 döner VE CROSS_TENANT_ACCESS_ATTEMPT loglanır (stock.service.ts)', async () => {
      const authHeader2 = `Bearer ${ctx2.accessToken}`;
      const category2 = await createCategory(prisma, ctx2.tenantId, 'E2E CrossTenant Stok Kategorisi');
      const productRes = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', authHeader2)
        .send({
          sku: `E2E-XT-STOCK-${uniqueSuffix()}`,
          name: 'E2E CrossTenant Stok Ürünü',
          unit: 'adet',
          categoryId: category2.id,
        })
        .expect(201);
      const foreignProductId = productRes.body.id;

      const initRes = await request(app.getHttpServer())
        .post('/api/v1/stock/initialize')
        .set('Authorization', authHeader2)
        .send({ branchId: ctx2.branchId, items: [{ productId: foreignProductId, quantity: 10 }] })
        .expect(201);
      const foreignStockLevelId = initRes.body[0].id;

      await request(app.getHttpServer())
        .get(`/api/v1/stock/${ctx2.branchId}/${foreignProductId}`)
        .set('Authorization', `Bearer ${ctx1.accessToken}`)
        .expect(404);

      const events = await waitForSecurityEvent(
        'CROSS_TENANT_ACCESS_ATTEMPT',
        (e) => e.context?.resourceId === foreignStockLevelId,
      );
      const match = events.find((e) => e.context?.resourceId === foreignStockLevelId);
      expect(match).toBeDefined();
      expect(match!.context?.resourceType).toBe('StockLevel');
      expect(match!.tenantId).toBe(ctx1.tenantId);
      expect(JSON.stringify(match)).not.toContain(ctx2.tenantId);
    });

    it('Gerçekten var olmayan bir şube/ürün kombinasyonuyla stok sorgusu 404 döner ama HİÇBİR SecurityEvent oluşmaz (yanlış pozitif yok)', async () => {
      const fakeBranchId = '99999999-9999-4999-8999-999999999998';
      const fakeProductId = '99999999-9999-4999-8999-999999999997';

      const before = await listSecurityEvents('CROSS_TENANT_ACCESS_ATTEMPT');

      await request(app.getHttpServer())
        .get(`/api/v1/stock/${fakeBranchId}/${fakeProductId}`)
        .set('Authorization', `Bearer ${ctx1.accessToken}`)
        .expect(404);

      const after = await listSecurityEvents('CROSS_TENANT_ACCESS_ATTEMPT');
      expect(after.length).toBe(before.length);
    });

    // ocr.service.ts — confirmScan (aynı desen confirmReturn'de de var, tek
    // bir örnek yeterli çünkü ikisi de birebir aynı assertTenantOwnership
    // çağrısını kullanıyor).
    it('Başka bir tenant\'ın OCR taramasını onaylama denemesi 404 döner VE CROSS_TENANT_ACCESS_ATTEMPT loglanır (ocr.service.ts)', async () => {
      const authHeader2 = `Bearer ${ctx2.accessToken}`;
      const scanRes = await request(app.getHttpServer())
        .post('/api/v1/ocr/scan')
        .set('Authorization', authHeader2)
        .send({ branchId: ctx2.branchId })
        .expect(201);
      const foreignScanId = scanRes.body.scanId;

      await request(app.getHttpServer())
        .post(`/api/v1/ocr/scan/${foreignScanId}/confirm`)
        .set('Authorization', `Bearer ${ctx1.accessToken}`)
        .send({ supplierId: '11111111-1111-4111-8111-111111111111', lines: [] })
        .expect(404);

      const events = await listSecurityEvents('CROSS_TENANT_ACCESS_ATTEMPT');
      const match = events.find((e) => e.context?.resourceId === foreignScanId);
      expect(match).toBeDefined();
      expect(match!.context?.resourceType).toBe('OcrScan');
      expect(match!.tenantId).toBe(ctx1.tenantId);
      expect(JSON.stringify(match)).not.toContain(ctx2.tenantId);
    });

    // portal.service.ts (applyPricesToProducts) — TEK istisna: bu, batch
    // içindeki bir kalemin sessizce ATLANMASI (continue) gerektiği için (bkz.
    // görev notları — tüm onayı iptal etmemeli), assertTenantOwnership burada
    // yerel bir try/catch içinde çağrılıyor. Bu test HEM loglamayı HEM DE
    // batch'in geri kalanının (geçerli kalemin) başarıyla işlendiğini
    // doğruluyor — partial-success semantiği korunmuş olmalı.
    it('Toplu fiyat onayında başka tenant\'a ait bir kalem sessizce atlanır + loglanır, GEÇERLİ kalemler yine de uygulanır (portal.service.ts)', async () => {
      const authHeader2 = `Bearer ${ctx2.accessToken}`;

      // ctx2'de "yabancı" bir ürün — ctx1'in batch'ine karışacak.
      const category2 = await createCategory(prisma, ctx2.tenantId, 'E2E CrossTenant Portal Kategorisi');
      const foreignProductRes = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', authHeader2)
        .send({
          sku: `E2E-XT-PORTAL-${uniqueSuffix()}`,
          name: 'E2E CrossTenant Portal Ürünü',
          unit: 'adet',
          categoryId: category2.id,
        })
        .expect(201);
      const foreignProductId = foreignProductRes.body.id;

      // ctx1'de GEÇERLİ bir ürün — batch'teki tek "sağlam" kalem.
      const category1 = await createCategory(prisma, ctx1.tenantId, 'E2E Portal Kategorisi (Geçerli)');
      const validProductRes = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${ctx1.accessToken}`)
        .send({
          sku: `E2E-VALID-PORTAL-${uniqueSuffix()}`,
          name: 'E2E Geçerli Portal Ürünü',
          unit: 'adet',
          categoryId: category1.id,
        })
        .expect(201);
      const validProductId = validProductRes.body.id;

      // ctx1 için portal + OTP + upload akışı (portal.e2e-spec.ts ile aynı desen).
      const portalRes = await request(app.getHttpServer())
        .post(`/api/v1/branches/${ctx1.branchId}/portal`)
        .set('Authorization', `Bearer ${ctx1.accessToken}`)
        .expect(201);
      const subdomain = portalRes.body.subdomain;

      const PORTAL_OTP_PHONE = '+905557778899';
      await request(app.getHttpServer())
        .post(`/api/v1/portal/${subdomain}/otp/send`)
        .send({ phone: PORTAL_OTP_PHONE })
        .expect(200);
      const verifyRes = await request(app.getHttpServer())
        .post(`/api/v1/portal/${subdomain}/otp/verify`)
        .send({ phone: PORTAL_OTP_PHONE, otp: '123456' })
        .expect(200);
      const sessionToken = verifyRes.body.sessionToken;

      const uploadRes = await request(app.getHttpServer())
        .post(`/api/v1/portal/${subdomain}/upload`)
        .send({ phone: PORTAL_OTP_PHONE, sessionToken })
        .expect(201);
      const batchUploadId = uploadRes.body.uploadId;

      // Gerçekten var olmayan (rastgele UUID) bir ürün de batch'e ekleniyor —
      // yanlış-pozitif kontrolü için (assertTenantOwnership resource null
      // olduğunda loglamaz).
      const nonExistentProductId = '22222222-2222-4222-8222-222222222222';

      await request(app.getHttpServer())
        .patch(`/api/v1/portal/uploads/${batchUploadId}/items`)
        .set('Authorization', `Bearer ${ctx1.accessToken}`)
        .send({
          items: [
            { productId: validProductId, newPrice: 42.5 },
            { productId: foreignProductId, newPrice: 999 },
            { productId: nonExistentProductId, newPrice: 1 },
          ],
        })
        .expect(200);

      const beforeCrossTenant = await listSecurityEvents('CROSS_TENANT_ACCESS_ATTEMPT');

      await request(app.getHttpServer())
        .patch(`/api/v1/portal/uploads/${batchUploadId}/approve`)
        .set('Authorization', `Bearer ${ctx1.accessToken}`)
        .expect(200);

      // (1) Geçerli kalem YİNE DE uygulandı — batch'in geri kalanı iptal olmadı.
      const validProductAfter = await request(app.getHttpServer())
        .get(`/api/v1/products/${validProductId}`)
        .set('Authorization', `Bearer ${ctx1.accessToken}`)
        .expect(200);
      expect(Number(validProductAfter.body.salePrice)).toBe(42.5);

      // (2) Yabancı ürünün fiyatı HİÇ değişmedi.
      const foreignProductAfter = await request(app.getHttpServer())
        .get(`/api/v1/products/${foreignProductId}`)
        .set('Authorization', authHeader2)
        .expect(200);
      expect(foreignProductAfter.body.salePrice).toBeNull();

      // (3) Yabancı kalem için CROSS_TENANT_ACCESS_ATTEMPT loglandı.
      const afterCrossTenant = await listSecurityEvents('CROSS_TENANT_ACCESS_ATTEMPT');
      const match = afterCrossTenant.find((e) => e.context?.resourceId === foreignProductId);
      expect(match).toBeDefined();
      expect(match!.context?.resourceType).toBe('Product');
      expect(match!.tenantId).toBe(ctx1.tenantId);
      expect(JSON.stringify(match)).not.toContain(ctx2.tenantId);

      // (4) Gerçekten var olmayan ürün için HİÇBİR event oluşmadı (yanlış pozitif yok).
      expect(afterCrossTenant.some((e) => e.context?.resourceId === nonExistentProductId)).toBe(
        false,
      );
      // Toplam sayı da yalnızca 1 arttı (yabancı ürün), var-olmayan için değil.
      expect(afterCrossTenant.length).toBe(beforeCrossTenant.length + 1);
    });
  });
});
