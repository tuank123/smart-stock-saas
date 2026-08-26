/**
 * Yönetim Paneli / Admin (admin.controller.ts) — tüm uç noktalar
 * @Roles(SUPER_ADMIN). Platform sahibi tüm tenant'lara RLS bypass'ıyla
 * erişebildiği için blast-radius en yüksek modül; bu yüzden en kritik test
 * yetkisiz-erişim reddi.
 *
 * SUPER_ADMIN de User.tenantId zorunluluğundan muaf değil (bkz.
 * create-super-admin.ts) — createRoleUser() ile mint edilen SUPER_ADMIN
 * kullanıcısı ctx1'in tenant'ına "ev sahibi" olarak bağlanıyor, ama
 * TenantGuard SUPER_ADMIN'i tenant kontrolünden muaf tuttuğu için (bkz.
 * tenant.guard.ts) bu, admin uçlarının DAVRANIŞINI etkilemiyor.
 *
 * error_logs tablosunun REST üzerinden create'i yok (yalnızca sistem hataları
 * kendiliğinden yazar); testte createCategory ile aynı gerekçeyle doğrudan
 * Prisma ile satır ekleniyor. Bu tabloda FK yok (migration'da doğrulandı),
 * afterAll'da id'ye göre elle temizleniyor.
 */
import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import {
  createTestApp,
  cleanupTenants,
  createRoleUser,
  signupAndGetContext,
  uniqueSuffix,
  type SignedUpContext,
} from './setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Yönetim Paneli / Admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx1: SignedUpContext;
  let ctx2: SignedUpContext;
  let authHeader1: string;
  let superAdminAuthHeader: string;
  const errorLogIds: string[] = [];

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx1 = await signupAndGetContext(app);
    authHeader1 = `Bearer ${ctx1.accessToken}`;
    createdTaxNumbers.push(ctx1.payload.taxNumber);

    ctx2 = await signupAndGetContext(app);
    createdTaxNumbers.push(ctx2.payload.taxNumber);

    const superAdmin = await createRoleUser(app, prisma, {
      tenantId: ctx1.tenantId,
      branchId: null,
      role: UserRole.SUPER_ADMIN,
    });
    superAdminAuthHeader = `Bearer ${superAdmin.accessToken}`;
  });

  afterAll(async () => {
    if (errorLogIds.length) {
      await prisma.errorLog.deleteMany({ where: { id: { in: errorLogIds } } }).catch(() => undefined);
    }
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  // ── (a) Yetkisiz erişim reddi — EN KRİTİK TEST ───────────────────────────

  it('GET /admin/tenants — token yoksa 401 döner', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/tenants').expect(401);
  });

  it('GET /admin/tenants — PATRON (SUPER_ADMIN olmayan) rolüyle 403 döner', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/tenants')
      .set('Authorization', authHeader1)
      .expect(403);
  });

  it('PATCH /admin/tenants/:id/status — PATRON rolüyle 403 döner (başka tenant\'ı kapatamaz)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/tenants/${ctx2.tenantId}/status`)
      .set('Authorization', authHeader1)
      .send({ status: 'SUSPENDED' })
      .expect(403);
  });

  it('GET /admin/stats — PATRON rolüyle 403 döner', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set('Authorization', authHeader1)
      .expect(403);
  });

  // ── (b) SUPER_ADMIN — tenant listesi (birden fazla tenant görünür) ──────

  it('GET /admin/tenants — SUPER_ADMIN her iki test tenant\'ını da görebilir', async () => {
    const res1 = await request(app.getHttpServer())
      .get('/api/v1/admin/tenants')
      .set('Authorization', superAdminAuthHeader)
      .query({ search: ctx1.payload.companyName })
      .expect(200);
    expect(res1.body.items.some((t: { id: string }) => t.id === ctx1.tenantId)).toBe(true);

    const res2 = await request(app.getHttpServer())
      .get('/api/v1/admin/tenants')
      .set('Authorization', superAdminAuthHeader)
      .query({ search: ctx2.payload.companyName })
      .expect(200);
    expect(res2.body.items.some((t: { id: string }) => t.id === ctx2.tenantId)).toBe(true);
  });

  it('GET /admin/tenants/:id — tenant detayında kullanıcılar ve şubeler görünür', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/tenants/${ctx1.tenantId}`)
      .set('Authorization', superAdminAuthHeader)
      .expect(200);

    expect(res.body.id).toBe(ctx1.tenantId);
    expect(res.body.users.some((u: { email: string }) => u.email === ctx1.payload.email)).toBe(true);
    expect(res.body.branches.some((b: { id: string }) => b.id === ctx1.branchId)).toBe(true);
  });

  // ── (c) Tenant durumu değiştirme ─────────────────────────────────────────

  it('PATCH /admin/tenants/:id/status — SUSPENDED yapınca durum kaydedilir ve kullanıcılar pasifleşir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/tenants/${ctx2.tenantId}/status`)
      .set('Authorization', superAdminAuthHeader)
      .send({ status: 'SUSPENDED' })
      .expect(200);
    expect(res.body.status).toBe('SUSPENDED');

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/tenants/${ctx2.tenantId}`)
      .set('Authorization', superAdminAuthHeader)
      .expect(200);
    expect(detail.body.status).toBe('SUSPENDED');
    expect(detail.body.closedAt).not.toBeNull();
    expect(detail.body.users.every((u: { isActive: boolean }) => u.isActive === false)).toBe(true);
  });

  it('PATCH /admin/tenants/:id/status — ACTIVE\'e döndürünce closedAt temizlenir', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/tenants/${ctx2.tenantId}/status`)
      .set('Authorization', superAdminAuthHeader)
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(res.body.status).toBe('ACTIVE');

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/tenants/${ctx2.tenantId}`)
      .set('Authorization', superAdminAuthHeader)
      .expect(200);
    expect(detail.body.closedAt).toBeNull();
  });

  // ── (d) İstatistikler ─────────────────────────────────────────────────────

  it('GET /admin/stats — beklenen alan yapısıyla 200 döner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set('Authorization', superAdminAuthHeader)
      .expect(200);

    expect(typeof res.body.totalTenants).toBe('number');
    expect(res.body.totalTenants).toBeGreaterThanOrEqual(2);
    expect(typeof res.body.totalUsers).toBe('number');
    expect(typeof res.body.estimatedMonthlyRevenue).toBe('number');
    expect(typeof res.body.failedSyncJobs).toBe('number');
    expect(res.body.statusBreakdown).toHaveProperty('ACTIVE');
    expect(res.body.planBreakdown).toHaveProperty('STARTER');
  });

  // ── (e) Hata kayıtları ────────────────────────────────────────────────────

  it('GET /admin/errors + PATCH /admin/errors/:id/resolve — listeleme ve çözüldü işaretleme', async () => {
    const marker = `E2E-ADMIN-${uniqueSuffix()}`;
    const created = await prisma.errorLog.create({
      data: {
        source: 'API_EXCEPTION',
        severity: 'ERROR',
        message: marker,
        tenantId: ctx1.tenantId,
        resolved: false,
      },
      select: { id: true },
    });
    errorLogIds.push(created.id);

    const beforeCount = await request(app.getHttpServer())
      .get('/api/v1/admin/errors/unresolved-count')
      .set('Authorization', superAdminAuthHeader)
      .expect(200);
    expect(beforeCount.body.count).toBeGreaterThanOrEqual(1);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/admin/errors')
      .set('Authorization', superAdminAuthHeader)
      .query({ resolved: 'false', source: 'API_EXCEPTION' })
      .expect(200);
    const found = listRes.body.items.find((e: { id: string }) => e.id === created.id);
    expect(found).toBeDefined();
    expect(found.message).toBe(marker);
    expect(found.resolved).toBe(false);

    const resolveRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/errors/${created.id}/resolve`)
      .set('Authorization', superAdminAuthHeader)
      .expect(200);
    expect(resolveRes.body.resolved).toBe(true);
    expect(resolveRes.body.resolvedAt).not.toBeNull();

    // Artık resolved:false filtresinde görünmemeli.
    const afterResolveList = await request(app.getHttpServer())
      .get('/api/v1/admin/errors')
      .set('Authorization', superAdminAuthHeader)
      .query({ resolved: 'false', source: 'API_EXCEPTION' })
      .expect(200);
    expect(afterResolveList.body.items.some((e: { id: string }) => e.id === created.id)).toBe(false);
  });
});
