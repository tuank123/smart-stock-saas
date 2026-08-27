/**
 * Kullanıcı listeleme (users.controller.ts) — GET /users/branch/:branchId.
 * @Roles(PATRON, SUBE_MUDURU); SUBE_MUDURU yalnızca kendi şubesini
 * görebilir (servis içi ek kontrol), tenant izolasyonu ayrıca servis
 * seviyesinde branch.tenantId karşılaştırmasıyla sağlanıyor.
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

describe('Kullanıcı Listeleme / Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx1: SignedUpContext;
  let ctx2: SignedUpContext;
  let authHeader1: string;
  let subeAuthHeader1: string;
  let secondBranchId: string;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx1 = await signupAndGetContext(app, { businessType: 'COK_SUBE' });
    authHeader1 = `Bearer ${ctx1.accessToken}`;
    createdTaxNumbers.push(ctx1.payload.taxNumber);

    ctx2 = await signupAndGetContext(app);
    createdTaxNumbers.push(ctx2.payload.taxNumber);

    const subeMuduru1 = await createRoleUser(app, prisma, {
      tenantId: ctx1.tenantId,
      branchId: ctx1.branchId,
      role: UserRole.SUBE_MUDURU,
    });
    subeAuthHeader1 = `Bearer ${subeMuduru1.accessToken}`;

    const branchRes = await request(app.getHttpServer())
      .post('/api/v1/branches')
      .set('Authorization', authHeader1)
      .send({ name: 'E2E İkinci Şube', slug: `e2e-users-sube-2-${uniqueSuffix()}` })
      .expect(201);
    secondBranchId = branchRes.body.id;
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  // ── (a) PATRON kendi şubesinin personelini görebilir ─────────────────────

  it('GET /users/branch/:branchId — PATRON, şubedeki kullanıcıları (kendisi + SUBE_MUDURU) görebilir', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/users/branch/${ctx1.branchId}`)
      .set('Authorization', authHeader1)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((u: { email: string }) => u.email === ctx1.payload.email)).toBe(true);
    expect(res.body.every((u: { role: string }) => typeof u.role === 'string' || u.role === null)).toBe(true);
  });

  // ── (b) SUBE_MUDURU yalnızca kendi şubesini görebilir ────────────────────

  it('GET /users/branch/:branchId — SUBE_MUDURU kendi şubesini görebilir', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/users/branch/${ctx1.branchId}`)
      .set('Authorization', subeAuthHeader1)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /users/branch/:branchId — SUBE_MUDURU aynı tenant\'ın BAŞKA bir şubesini göremez (403)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/users/branch/${secondBranchId}`)
      .set('Authorization', subeAuthHeader1)
      .expect(403);
  });

  // ── (c) Tenant izolasyonu ─────────────────────────────────────────────────

  it('GET /users/branch/:branchId — başka tenant\'ın şubesi verilirse 404 döner (boş liste değil)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/users/branch/${ctx2.branchId}`)
      .set('Authorization', authHeader1)
      .expect(404);
  });
});
