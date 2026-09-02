/**
 * E-posta tabanlı iki faktörlü doğrulama (2FA) — yalnızca PATRON ve
 * SUPER_ADMIN için ZORUNLU. Diğer roller (SUBE_MUDURU/KASIYER/DEPO)
 * etkilenmez (bkz. (d) regresyon testi).
 *
 * Kod, portal.service.ts'teki OTP deseniyle aynı şekilde Redis'te TTL'li
 * saklanıyor (mock e-posta yalnızca loglandığı için testler kodu doğrudan
 * Redis'ten — readRedisValue ile — okuyor, tıpkı forgot-password/verify-email
 * testlerinin token'ı DB'den okuması gibi).
 *
 * İki ayrı describe/app kullanılıyor: /auth/login @Throttle(5/15dk) ve
 * /auth/verify-2fa @Throttle(10/15dk) bütçesini bu dosya içinde aşmamak için
 * (auth.e2e-spec.ts'teki aynı gerekçe — bkz. o dosyanın throttle notları).
 * İlk grup (a-d) başına 4, ikinci grup (e-g) başına 3 /auth/login çağrısı
 * yapıyor; her ikisi de kendi app örneğinin 5'lik bütçesi içinde kalıyor.
 */
import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import {
  createTestApp,
  cleanupTenants,
  createRoleUser,
  readRedisValue,
  deleteRedisValue,
  signupAndGetContext,
  signupPayload,
} from './setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { withTenantContext } from '../src/common/utils/tenant-context';

interface SecurityEventItem {
  context: Record<string, unknown> | null;
}

async function waitForTwoFaFailedEvent(
  prisma: PrismaService,
  userId: string,
  reason: string,
  timeoutMs = 1000,
): Promise<SecurityEventItem | undefined> {
  const start = Date.now();
  for (;;) {
    const events = await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
      return tx.errorLog.findMany({
        where: { source: 'SECURITY_EVENT' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { context: true },
      });
    });
    const match = events.find(
      (e) =>
        (e.context as Record<string, unknown> | null)?.eventType === 'TWO_FA_FAILED' &&
        (e.context as Record<string, unknown> | null)?.userId === userId &&
        (e.context as Record<string, unknown> | null)?.reason === reason,
    );
    if (match || Date.now() - start > timeoutMs) return match as SecurityEventItem | undefined;
    await new Promise((r) => setTimeout(r, 20));
  }
}

// ── Grup 1: login() dallanması (requires2fa / diğer roller etkilenmez) ─────

describe('Auth — E-posta 2FA: login() dallanması (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  // ── (a) PATRON ──────────────────────────────────────────────────────────

  it('POST /auth/login — PATRON için requires2fa + tempToken döner, tam token DEĞİL', async () => {
    const payload = signupPayload();
    await request(app.getHttpServer())
      .post('/api/v1/tenants/signup')
      .send(payload)
      .expect(201);
    createdTaxNumbers.push(payload.taxNumber);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: payload.password })
      .expect(200);

    expect(res.body.message).toBe('Doğrulama kodu e-posta adresinize gönderildi');
    expect(res.body.data.requires2fa).toBe(true);
    expect(typeof res.body.data.tempToken).toBe('string');
    expect(res.body.data.tempToken.length).toBeGreaterThan(0);
    expect(res.body.data).not.toHaveProperty('accessToken');
    expect(res.body.data).not.toHaveProperty('user');
  });

  // ── (b) SUPER_ADMIN ─────────────────────────────────────────────────────

  it('POST /auth/login — SUPER_ADMIN için de requires2fa + tempToken döner', async () => {
    const hostCtx = await signupAndGetContext(app);
    createdTaxNumbers.push(hostCtx.payload.taxNumber);

    const superAdmin = await createRoleUser(app, prisma, {
      tenantId: hostCtx.tenantId,
      branchId: null,
      role: UserRole.SUPER_ADMIN,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: superAdmin.email, password: 'Test1234' })
      .expect(200);

    expect(res.body.data.requires2fa).toBe(true);
    expect(typeof res.body.data.tempToken).toBe('string');
  });

  // ── (c) Kritik güvenlik testi: tempToken tam yetki VERMEMELİ ────────────

  it('GET /auth/me — 2FA tempToken\'ı ile korumalı endpoint\'e erişim reddedilir', async () => {
    const payload = signupPayload();
    await request(app.getHttpServer())
      .post('/api/v1/tenants/signup')
      .send(payload)
      .expect(201);
    createdTaxNumbers.push(payload.taxNumber);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: payload.password })
      .expect(200);
    const { tempToken } = login.body.data;

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tempToken}`)
      .expect(401);
  });

  // ── (d) Regresyon: diğer roller HİÇ etkilenmedi ──────────────────────────

  it('POST /auth/login — SUBE_MUDURU için davranış hiç değişmedi (tek adımda tam token)', async () => {
    const hostCtx = await signupAndGetContext(app);
    createdTaxNumbers.push(hostCtx.payload.taxNumber);

    const subeMuduru = await createRoleUser(app, prisma, {
      tenantId: hostCtx.tenantId,
      branchId: hostCtx.branchId,
      role: UserRole.SUBE_MUDURU,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: subeMuduru.email, password: 'Test1234' })
      .expect(200);

    expect(res.body.message).toBe('Login successful');
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.user.role).toBe('SUBE_MUDURU');
    expect(res.body.data).not.toHaveProperty('requires2fa');

    // Tam token gerçekten çalışıyor — korumalı bir endpoint'e erişebiliyor.
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`)
      .expect(200);
  });
});

// ── Grup 2: POST /auth/verify-2fa ───────────────────────────────────────────

describe('Auth — E-posta 2FA: POST /auth/verify-2fa (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  async function loginPatronAndGetTempToken(): Promise<{
    payload: ReturnType<typeof signupPayload>;
    userId: string;
    tempToken: string;
  }> {
    const payload = signupPayload();
    const signup = await request(app.getHttpServer())
      .post('/api/v1/tenants/signup')
      .send(payload)
      .expect(201);
    createdTaxNumbers.push(payload.taxNumber);
    const userId = signup.body.data.user.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: payload.password })
      .expect(200);

    return { payload, userId, tempToken: login.body.data.tempToken };
  }

  // ── (e) Doğru kod → tam token, kod tek kullanımlık ──────────────────────

  it('POST /auth/verify-2fa — doğru kodla tam access/refresh token döner, kod tek kullanımlıktır', async () => {
    const { payload, userId, tempToken } = await loginPatronAndGetTempToken();
    const code = await readRedisValue(`2fa:code:${userId}`);
    expect(code).toMatch(/^\d{6}$/);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-2fa')
      .send({ tempToken, code })
      .expect(200);

    expect(res.body.message).toBe('Login successful');
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.user.email).toBe(payload.email);
    expect(res.body.data.user.role).toBe('PATRON');

    // Aynı kod ikinci kez kabul edilmez (tek kullanımlık — verify başarıyla
    // tamamlanınca Redis'ten siliniyor).
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-2fa')
      .send({ tempToken, code })
      .expect(401);
  });

  // ── (f) Yanlış kod + brute-force rate-limit ──────────────────────────────

  it('POST /auth/verify-2fa — yanlış kod reddedilir, limit aşılınca doğru kod bile kabul edilmez ve TWO_FA_FAILED loglanır', async () => {
    const { userId, tempToken } = await loginPatronAndGetTempToken();
    const correctCode = await readRedisValue(`2fa:code:${userId}`);
    expect(correctCode).toMatch(/^\d{6}$/);

    // '000000' asla üretilen kod aralığında değil (100000-999999) — güvenle "yanlış".
    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-2fa')
        .send({ tempToken, code: '000000' })
        .expect(401);
      expect(res.body.message).toBe('Kod hatalı veya süresi dolmuş');
    }

    // 6. deneme: sayaç (TWO_FA_MAX_ATTEMPTS=5) aşıldı — DOĞRU kodla bile reddedilir.
    const locked = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-2fa')
      .send({ tempToken, code: correctCode })
      .expect(401);
    expect(locked.body.message).toBe('Çok fazla hatalı deneme. Lütfen tekrar giriş yapın.');

    const rateLimitEvent = await waitForTwoFaFailedEvent(prisma, userId, 'rate_limited');
    expect(rateLimitEvent).toBeDefined();
  });

  // ── (g) Süresi geçmiş/silinmiş kod ───────────────────────────────────────

  it('POST /auth/verify-2fa — süresi dolmuş (silinmiş) kod reddedilir', async () => {
    const { userId, tempToken } = await loginPatronAndGetTempToken();

    // TTL sonrası davranışıyla birebir aynı: anahtar Redis'te artık yok.
    await deleteRedisValue(`2fa:code:${userId}`);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-2fa')
      .send({ tempToken, code: '123456' })
      .expect(401);
    expect(res.body.message).toBe('Kod hatalı veya süresi dolmuş');

    const expiredEvent = await waitForTwoFaFailedEvent(prisma, userId, 'expired_or_missing_code');
    expect(expiredEvent).toBeDefined();
  });
});
