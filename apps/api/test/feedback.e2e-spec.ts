/**
 * Geri Bildirim / Şikayet sistemi (UserFeedback) — teknik olmayan kullanıcı
 * geri bildirimleri için ErrorLog'un yanına eklenen ayrı, basit bir akış.
 *
 * POST /feedback: yalnızca tek şubeli (STARTER) PATRON — debts/portal
 * servislerindeki "PATRON && planId !== 'STARTER' → Forbidden" deseniyle
 * aynı fikir (bkz. feedback.service.ts:create).
 * GET/PATCH /admin/feedback: yalnızca SUPER_ADMIN (admin.controller.ts'teki
 * /admin/errors uçlarıyla aynı desen).
 *
 * user_feedback RLS'siz (ErrorLog ile aynı gerekçe) — cleanupTenants zaten
 * tenantId üzerinden temizliyor (bkz. setup.ts:deleteTenantByTaxNumber),
 * admin.e2e-spec.ts'teki gibi ayrıca elle id takibi gerekmiyor.
 */
import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import {
  createTestApp,
  cleanupTenants,
  createRoleUser,
  signupAndGetContext,
  type SignedUpContext,
} from './setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Geri Bildirim / Şikayet (UserFeedback) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const createdTaxNumbers: string[] = [];

  // STARTER (tek şubeli) PATRON — asıl izinli senaryo.
  let starterCtx: SignedUpContext;
  let starterAuthHeader: string;

  // PROFESSIONAL (çok şubeli) PATRON — reddedilmesi gereken senaryo.
  let proCtx: SignedUpContext;
  let proAuthHeader: string;

  let superAdminAuthHeader: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    starterCtx = await signupAndGetContext(app);
    createdTaxNumbers.push(starterCtx.payload.taxNumber);
    starterAuthHeader = `Bearer ${starterCtx.accessToken}`;

    proCtx = await signupAndGetContext(app, { businessType: 'COK_SUBE' });
    createdTaxNumbers.push(proCtx.payload.taxNumber);
    proAuthHeader = `Bearer ${proCtx.accessToken}`;

    const superAdmin = await createRoleUser(app, prisma, {
      tenantId: starterCtx.tenantId,
      branchId: null,
      role: UserRole.SUPER_ADMIN,
    });
    superAdminAuthHeader = `Bearer ${superAdmin.accessToken}`;
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  // ── (a) STARTER PATRON gönderebilir ─────────────────────────────────────

  it('POST /feedback — STARTER (tek şubeli) PATRON gönderebilir, status NEW ile başlar', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/feedback')
      .set('Authorization', starterAuthHeader)
      .send({ subject: 'Rapor ekranı yavaş', message: 'Günlük rapor sayfası 5+ saniyede açılıyor.' })
      .expect(201);

    expect(res.body.subject).toBe('Rapor ekranı yavaş');
    expect(res.body.message).toBe('Günlük rapor sayfası 5+ saniyede açılıyor.');
    expect(res.body.status).toBe('NEW');
    expect(res.body.tenantId).toBe(starterCtx.tenantId);
    expect(res.body.userId).toBe(starterCtx.userId);
    expect(res.body.readAt).toBeNull();
  });

  it('POST /feedback — kısa konu/mesaj 400 döner (doğrulama)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/feedback')
      .set('Authorization', starterAuthHeader)
      .send({ subject: 'ab', message: 'ab' })
      .expect(400);
  });

  // ── (b) Non-STARTER PATRON reddedilir ───────────────────────────────────

  it('POST /feedback — PROFESSIONAL (çok şubeli) PATRON 403 alır', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/feedback')
      .set('Authorization', proAuthHeader)
      .send({ subject: 'Herhangi bir konu', message: 'Herhangi bir mesaj metni.' })
      .expect(403);

    expect(res.body.message).toContain('STARTER');
  });

  // ── (c) Diğer roller (PATRON dışı) reddedilir ────────────────────────────

  it('POST /feedback — SUBE_MUDURU 403 alır (@Roles(PATRON) dışı)', async () => {
    const subeMuduru = await createRoleUser(app, prisma, {
      tenantId: starterCtx.tenantId,
      branchId: starterCtx.branchId,
      role: UserRole.SUBE_MUDURU,
      planId: 'STARTER',
    });

    await request(app.getHttpServer())
      .post('/api/v1/feedback')
      .set('Authorization', `Bearer ${subeMuduru.accessToken}`)
      .send({ subject: 'Herhangi bir konu', message: 'Herhangi bir mesaj metni.' })
      .expect(403);
  });

  it('POST /feedback — KASIYER 403 alır (@Roles(PATRON) dışı)', async () => {
    const kasiyer = await createRoleUser(app, prisma, {
      tenantId: starterCtx.tenantId,
      branchId: starterCtx.branchId,
      role: UserRole.KASIYER,
      planId: 'STARTER',
    });

    await request(app.getHttpServer())
      .post('/api/v1/feedback')
      .set('Authorization', `Bearer ${kasiyer.accessToken}`)
      .send({ subject: 'Herhangi bir konu', message: 'Herhangi bir mesaj metni.' })
      .expect(403);
  });

  it('POST /feedback — JWT olmadan 401 alır', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/feedback')
      .send({ subject: 'Herhangi bir konu', message: 'Herhangi bir mesaj metni.' })
      .expect(401);
  });

  // ── (d) SUPER_ADMIN listeleyip okundu işaretleyebilir ────────────────────

  it('GET /admin/feedback — SUPER_ADMIN gönderilen kaydı görebilir (en yeni üstte)', async () => {
    const subject = `E2E liste testi ${Date.now()}`;
    await request(app.getHttpServer())
      .post('/api/v1/feedback')
      .set('Authorization', starterAuthHeader)
      .send({ subject, message: 'Listeleme testi için oluşturulan kayıt.' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/feedback')
      .set('Authorization', superAdminAuthHeader)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items[0].subject).toBe(subject);
    expect(res.body.items[0].status).toBe('NEW');
    // Gönderen tenant/kullanıcı bilgisi dahil.
    expect(res.body.items[0].tenant.id).toBe(starterCtx.tenantId);
    expect(res.body.items[0].user.id).toBe(starterCtx.userId);
    expect(typeof res.body.total).toBe('number');
  });

  it('PATCH /admin/feedback/:id/read — SUPER_ADMIN okundu olarak işaretleyebilir', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/feedback')
      .set('Authorization', starterAuthHeader)
      .send({ subject: 'Okundu işaretleme testi', message: 'Bu kayıt okundu olarak işaretlenecek.' })
      .expect(201);
    const feedbackId = created.body.id;

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/admin/feedback/${feedbackId}/read`)
      .set('Authorization', superAdminAuthHeader)
      .expect(200);

    expect(res.body.status).toBe('READ');
    expect(res.body.readAt).not.toBeNull();
  });

  it('PATCH /admin/feedback/:id/read — olmayan id için 404 döner', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/feedback/00000000-0000-0000-0000-000000000000/read')
      .set('Authorization', superAdminAuthHeader)
      .expect(404);
  });

  // ── (d.1) Sidebar rozeti — unread-count ──────────────────────────────────

  it('GET /admin/feedback/unread-count — yeni gönderim sonrası artar, okundu işaretlenince azalır', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/v1/admin/feedback/unread-count')
      .set('Authorization', superAdminAuthHeader)
      .expect(200);
    expect(typeof before.body.count).toBe('number');

    const created = await request(app.getHttpServer())
      .post('/api/v1/feedback')
      .set('Authorization', starterAuthHeader)
      .send({ subject: 'Unread count testi', message: 'Bu kayıt sayaç testi için oluşturuldu.' })
      .expect(201);

    const afterCreate = await request(app.getHttpServer())
      .get('/api/v1/admin/feedback/unread-count')
      .set('Authorization', superAdminAuthHeader)
      .expect(200);
    expect(afterCreate.body.count).toBe(before.body.count + 1);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/feedback/${created.body.id}/read`)
      .set('Authorization', superAdminAuthHeader)
      .expect(200);

    const afterRead = await request(app.getHttpServer())
      .get('/api/v1/admin/feedback/unread-count')
      .set('Authorization', superAdminAuthHeader)
      .expect(200);
    expect(afterRead.body.count).toBe(before.body.count);
  });

  // ── (e) Normal kullanıcılar admin uçlarına erişemez ─────────────────────

  it('GET /admin/feedback — PATRON (SUPER_ADMIN olmayan) 403 alır', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/feedback')
      .set('Authorization', starterAuthHeader)
      .expect(403);
  });

  it('PATCH /admin/feedback/:id/read — PATRON (SUPER_ADMIN olmayan) 403 alır', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/feedback/00000000-0000-0000-0000-000000000000/read')
      .set('Authorization', starterAuthHeader)
      .expect(403);
  });

  it('GET /admin/feedback — JWT olmadan 401 alır', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/feedback').expect(401);
  });
});
