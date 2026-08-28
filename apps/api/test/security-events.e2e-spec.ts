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

    const events = await listSecurityEvents('INVALID_AGENT_KEY');
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

      const events = await listSecurityEvents('CROSS_TENANT_ACCESS_ATTEMPT');
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

      const events = await listSecurityEvents('CROSS_TENANT_ACCESS_ATTEMPT');
      const match = events.find((e) => e.context?.resourceId === foreignDebtId);
      expect(match).toBeDefined();
      expect(match!.context?.resourceType).toBe('Debt');
      expect(match!.tenantId).toBe(ctx1.tenantId);
      expect(JSON.stringify(match)).not.toContain(ctx2.tenantId);
    });
  });
});
