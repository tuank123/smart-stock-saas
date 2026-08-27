/**
 * Tenant kendi-hesap yönetimi (tenants.controller.ts) — PATCH/DELETE
 * /tenants/me. İkisi de @Roles(PATRON).
 *
 * DELETE /tenants/me SOFT-DELETE'dir (closeMyMembership — bkz.
 * tenants.service.ts yorumu: "Üyeliği sonlandırır (soft-close)"): tenant
 * satırı SİLİNMİYOR, yalnızca status='DELETED' + closedAt set ediliyor ve
 * tenant'ın TÜM kullanıcıları isActive=false yapılıyor. Bu test mevcut
 * davranışı doğruluyor, production kodunu değiştirmiyor.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanupTenants,
  signupAndGetContext,
  type SignedUpContext,
} from './setup';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Tenant Kendi-Hesap Yönetimi (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx1: SignedUpContext;
  let ctx2: SignedUpContext;
  let authHeader1: string;
  let authHeader2: string;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx1 = await signupAndGetContext(app);
    authHeader1 = `Bearer ${ctx1.accessToken}`;
    createdTaxNumbers.push(ctx1.payload.taxNumber);

    // DELETE /me testi için AYRI bir tenant — ctx1'in üzerinde kalıcı bir
    // etki yaratmasın diye.
    ctx2 = await signupAndGetContext(app);
    authHeader2 = `Bearer ${ctx2.accessToken}`;
    createdTaxNumbers.push(ctx2.payload.taxNumber);
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  async function readTenantGlobal(tenantId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      const users = await tx.user.findMany({ where: { tenantId }, select: { isActive: true } });
      return { tenant, users };
    });
  }

  // ── (a) PATCH /tenants/me ────────────────────────────────────────────────

  it('PATCH /tenants/me — işletme bilgileri doğru kaydedilir', async () => {
    const newCompanyName = `E2E Güncellenmiş Şirket ${ctx1.payload.taxNumber}`;

    const res = await request(app.getHttpServer())
      .patch('/api/v1/tenants/me')
      .set('Authorization', authHeader1)
      .send({ companyName: newCompanyName })
      .expect(200);

    expect(res.body.companyName).toBe(newCompanyName);
    expect(res.body.id).toBe(ctx1.tenantId);

    const { tenant } = await readTenantGlobal(ctx1.tenantId);
    expect(tenant?.companyName).toBe(newCompanyName);
  });

  it('PATCH /tenants/me — token yoksa 401 döner', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/tenants/me')
      .send({ companyName: 'Yetkisiz Deneme' })
      .expect(401);
  });

  // ── (b) DELETE /tenants/me — soft-delete davranışını doğrula ────────────

  it('DELETE /tenants/me — mevcut davranış: soft-delete (status=DELETED, closedAt set, kullanıcılar pasifleşir)', async () => {
    const res = await request(app.getHttpServer())
      .delete('/api/v1/tenants/me')
      .set('Authorization', authHeader2)
      .expect(200);

    expect(res.body.message).toBe('Üyelik sonlandırıldı');

    const { tenant, users } = await readTenantGlobal(ctx2.tenantId);

    // Soft-delete: satır hâlâ mevcut, SİLİNMEMİŞ.
    expect(tenant).not.toBeNull();
    expect(tenant?.status).toBe('DELETED');
    expect(tenant?.closedAt).not.toBeNull();

    expect(users.length).toBeGreaterThan(0);
    expect(users.every((u) => u.isActive === false)).toBe(true);
  });
});
