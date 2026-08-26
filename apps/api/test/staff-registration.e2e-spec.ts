/**
 * Personel Kayıt (staff-registration.controller.ts, prefix '/auth/register')
 * — davet kodu üretimi (SUBE_MUDURU), Public tamamlama, ve rol atama
 * (yetki yükseltme/tenant izolasyonu odaklı).
 *
 * NOT: generate-code SADECE @Roles(SUBE_MUDURU) — PATRON DAHİL DEĞİL. Tek
 * şubeli (STARTER) tenant'larda PATRON'un aynı zamanda fiili şube müdürü
 * gibi davrandığı diğer birçok modülün aksine (stock/orders/portal'daki
 * "PATRON && planId==='STARTER'" istisnaları), bu uç noktada böyle bir
 * istisna YOK — bkz. rapor.
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

describe('Personel Kayıt / Staff Registration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx1: SignedUpContext;
  let ctx2: SignedUpContext;
  let authHeader1: string;
  let authHeader2: string;
  let subeAuthHeader1: string;
  let subeUserId1: string;
  let kasiyerAuthHeader1: string;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx1 = await signupAndGetContext(app);
    authHeader1 = `Bearer ${ctx1.accessToken}`;
    createdTaxNumbers.push(ctx1.payload.taxNumber);

    ctx2 = await signupAndGetContext(app);
    authHeader2 = `Bearer ${ctx2.accessToken}`;
    createdTaxNumbers.push(ctx2.payload.taxNumber);

    const subeMuduru1 = await createRoleUser(app, prisma, {
      tenantId: ctx1.tenantId,
      branchId: ctx1.branchId,
      role: UserRole.SUBE_MUDURU,
    });
    subeAuthHeader1 = `Bearer ${subeMuduru1.accessToken}`;
    subeUserId1 = subeMuduru1.userId;

    const kasiyer1 = await createRoleUser(app, prisma, {
      tenantId: ctx1.tenantId,
      branchId: ctx1.branchId,
      role: UserRole.KASIYER,
    });
    kasiyerAuthHeader1 = `Bearer ${kasiyer1.accessToken}`;
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  // ── (a) Davet kodu üretimi — rol kısıtı ──────────────────────────────────

  it('POST /auth/register/generate-code — SUBE_MUDURU 201 + kod döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register/generate-code')
      .set('Authorization', subeAuthHeader1)
      .expect(201);

    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
  });

  it('POST /auth/register/generate-code — PATRON rolüyle 403 döner (yalnızca SUBE_MUDURU üretebilir)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register/generate-code')
      .set('Authorization', authHeader1)
      .expect(403);
  });

  it('POST /auth/register/generate-code — KASIYER rolüyle 403 döner', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register/generate-code')
      .set('Authorization', kasiyerAuthHeader1)
      .expect(403);
  });

  // ── (b) Public: kayıt tamamlama ──────────────────────────────────────────

  let newUserId: string;
  const newUserEmail = `e2e-staff-${uniqueSuffix()}@example.test`;

  it('POST /auth/register/complete — Public, geçerli kodla kayıt tamamlanır (role:null ile)', async () => {
    const codeRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register/generate-code')
      .set('Authorization', subeAuthHeader1)
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register/complete')
      .send({ token: codeRes.body.token, name: 'E2E Yeni Personel', email: newUserEmail, password: 'Test1234' })
      .expect(201);

    expect(res.body.email).toBe(newUserEmail);
    newUserId = res.body.id;
  });

  it('POST /auth/register/complete — kullanılmış kod tekrar kabul edilmez (400)', async () => {
    const codeRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register/generate-code')
      .set('Authorization', subeAuthHeader1)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register/complete')
      .send({ token: codeRes.body.token, name: 'İlk Kullanım', email: `e2e-first-${uniqueSuffix()}@example.test`, password: 'Test1234' })
      .expect(201);

    // Aynı kod ikinci kez.
    await request(app.getHttpServer())
      .post('/api/v1/auth/register/complete')
      .send({ token: codeRes.body.token, name: 'İkinci Kullanım', email: `e2e-second-${uniqueSuffix()}@example.test`, password: 'Test1234' })
      .expect(400);
  });

  it('POST /auth/register/complete — geçersiz/uydurma kod reddedilir (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register/complete')
      .send({ token: 'UYDURMA1', name: 'X', email: `e2e-invalid-${uniqueSuffix()}@example.test`, password: 'Test1234' })
      .expect(400);
  });

  it('POST /auth/register/complete — aynı tenant içinde e-posta çakışması 409 döner', async () => {
    const codeRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register/generate-code')
      .set('Authorization', subeAuthHeader1)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register/complete')
      .send({ token: codeRes.body.token, name: 'Tekrar', email: newUserEmail, password: 'Test1234' })
      .expect(409);
  });

  // ── (c) Rol atama — yetki yükseltme + tenant izolasyonu ──────────────────

  it('PATCH /auth/register/assign-role/:userId — KASIYER rolüyle 403 döner', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/auth/register/assign-role/${newUserId}`)
      .set('Authorization', kasiyerAuthHeader1)
      .send({ role: 'KASIYER' })
      .expect(403);
  });

  it('PATCH /auth/register/assign-role/:userId — SUBE_MUDURU geçerli role (KASIYER) atayabilir', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/auth/register/assign-role/${newUserId}`)
      .set('Authorization', subeAuthHeader1)
      .send({ role: 'KASIYER' })
      .expect(200);

    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/users/branch/${ctx1.branchId}`)
      .set('Authorization', authHeader1)
      .expect(200);
    const updated = listRes.body.find((u: { id: string }) => u.id === newUserId);
    expect(updated).toBeDefined();
    expect(updated.role).toBe('KASIYER');
  });

  it('PATCH /auth/register/assign-role/:userId — DTO yalnızca KASIYER/DEPO kabul eder, PATRON/SUPER_ADMIN gibi yükseltilmiş roller 400 döner', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/auth/register/assign-role/${newUserId}`)
      .set('Authorization', subeAuthHeader1)
      .send({ role: 'PATRON' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/v1/auth/register/assign-role/${newUserId}`)
      .set('Authorization', subeAuthHeader1)
      .send({ role: 'SUPER_ADMIN' })
      .expect(400);
  });

  it('PATCH /auth/register/assign-role/:userId — SUBE_MUDURU kendi kendini PATRON yapamaz (kendi userId\'sini hedeflese bile 400)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/auth/register/assign-role/${subeUserId1}`)
      .set('Authorization', subeAuthHeader1)
      .send({ role: 'PATRON' })
      .expect(400);
  });

  it('PATCH /auth/register/assign-role/:userId — başka tenant\'ın kullanıcısına rol atanamaz (404 beklenir)', async () => {
    // ctx2'de, başlangıç rolü belli bir hedef kullanıcı: ctx2'nin PATRON'u.
    // Beklenen (güvenli) davranış: tenant1'in SUBE_MUDURU'sü tenant2'nin
    // kullanıcısını GÖRMEMELİ → 404. (assignRole servis kodu target.tenantId'yi
    // okuyor ama user.tenantId ile KARŞILAŞTIRMIYOR — bkz. rapor.)
    await request(app.getHttpServer())
      .patch(`/api/v1/auth/register/assign-role/${ctx2.userId}`)
      .set('Authorization', subeAuthHeader1)
      .send({ role: 'DEPO' })
      .expect(404);

    // Ne olursa olsun, ctx2'nin PATRON'unun rolü PATRON kalmalı.
    const detailRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', authHeader2)
      .expect(200);
    expect(detailRes.body.user.role).toBe('PATRON');
  });
});
