/**
 * Frontend Hata Raporlama (errors.controller.ts) — POST /errors/frontend.
 * React ErrorBoundary'nin yakaladığı çökmeleri backend'e (ErrorLog,
 * source:'FRONTEND_ERROR') iletir. @Public() — kimlik doğrulama ZORUNLU
 * değil (hatanın kendisi oturumu bozmuş olabilir), ama IP bazlı dakikada 10
 * istekle throttle edilir (bkz. errors.controller.ts).
 *
 * Tüm istekler `postError()` yardımcı fonksiyonu üzerinden gönderilip
 * `requestCount` ile sayılıyor — ThrottlerGuard, ValidationPipe'tan ÖNCE
 * çalıştığı için 400 ile reddedilen istekler bile throttle sayacına dahil
 * olur. Bu sayede rate-limit testi, önceki testlerde kaç istek atıldığından
 * bağımsız olarak tam sınırda (10. istek başarılı, 11. istek 429) çalışır.
 *
 * Tüm test mesajları `runPrefix` ile başlar — afterAll'da `startsWith` ile
 * tek seferde temizlenir (rate-limit testindeki döngüde üretilen mesajlar
 * dahil, tek tek id/marker takibi gerekmez).
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

describe('Frontend Hata Raporlama / Errors (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: SignedUpContext;
  let authHeader: string;
  let superAdminAuthHeader: string;

  const createdTaxNumbers: string[] = [];
  const runPrefix = `E2E-FRONTEND-ERR-${uniqueSuffix()}`;
  let requestCount = 0;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx = await signupAndGetContext(app);
    authHeader = `Bearer ${ctx.accessToken}`;
    createdTaxNumbers.push(ctx.payload.taxNumber);

    const superAdmin = await createRoleUser(app, prisma, {
      tenantId: ctx.tenantId,
      branchId: null,
      role: UserRole.SUPER_ADMIN,
    });
    superAdminAuthHeader = `Bearer ${superAdmin.accessToken}`;
  });

  afterAll(async () => {
    await prisma.errorLog
      .deleteMany({ where: { message: { startsWith: runPrefix } } })
      .catch(() => undefined);
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  function postError(body: Record<string, unknown>, authorization?: string) {
    requestCount++;
    const req = request(app.getHttpServer()).post('/api/v1/errors/frontend').send(body);
    return authorization ? req.set('Authorization', authorization) : req;
  }

  // ── (a) Anonim gönderim — kimlik doğrulama ZORUNLU değil ─────────────────

  it('POST /errors/frontend — token olmadan 201 döner, ErrorLog source:FRONTEND_ERROR ile kaydedilir, tenantId null olur', async () => {
    const marker = `${runPrefix}-ANON`;

    const res = await postError({
      message: marker,
      stack: 'Error: boom\n  at Component',
      componentStack: '  in Component\n  in ErrorBoundary',
      url: '/isletme-app/dashboard',
      userAgent: 'E2E-Test-Agent/1.0',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const created = await prisma.errorLog.findFirst({ where: { message: marker } });
    expect(created).toBeDefined();
    expect(created?.source).toBe('FRONTEND_ERROR');
    expect(created?.severity).toBe('ERROR');
    expect(created?.tenantId).toBeNull();
    expect(created?.stackTrace).toContain('boom');
    expect((created?.context as { url?: string })?.url).toBe('/isletme-app/dashboard');
    expect((created?.context as { userId?: string | null })?.userId).toBeNull();
  });

  // ── (b) Kimlik doğrulamalı gönderim — tenantId/userId kaydedilir ─────────

  it('POST /errors/frontend — geçerli token varsa tenantId ve userId context\'e kaydedilir', async () => {
    const marker = `${runPrefix}-AUTH`;

    const res = await postError({ message: marker, url: '/mudur/dashboard' }, authHeader);
    expect(res.status).toBe(201);

    const created = await prisma.errorLog.findFirst({ where: { message: marker } });
    expect(created).toBeDefined();
    expect(created?.tenantId).toBe(ctx.tenantId);
    expect((created?.context as { userId?: string })?.userId).toBe(ctx.userId);
  });

  // ── (c) Geçersiz/süresi dolmuş token — reddetmez, anonim kaydeder ────────

  it('POST /errors/frontend — geçersiz token isteği reddetmez, anonim olarak kaydeder', async () => {
    const marker = `${runPrefix}-BADTOKEN`;

    const res = await postError(
      { message: marker, url: '/test' },
      'Bearer this-is-not-a-valid-jwt',
    );
    expect(res.status).toBe(201);

    const created = await prisma.errorLog.findFirst({ where: { message: marker } });
    expect(created?.tenantId).toBeNull();
  });

  // ── (d) Doğrulama — zorunlu alanlar ───────────────────────────────────────

  it('POST /errors/frontend — message veya url eksikse 400 döner', async () => {
    const res = await postError({ url: '/test' });
    expect(res.status).toBe(400);
  });

  // ── (e) Admin panelinde görünürlük ────────────────────────────────────────

  it('GET /admin/errors?source=FRONTEND_ERROR — SUPER_ADMIN raporlanan hatayı görebilir', async () => {
    const marker = `${runPrefix}-ADMIN`;

    await postError({ message: marker, url: '/isletme-app/gecici-kasa' }, authHeader);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/admin/errors')
      .set('Authorization', superAdminAuthHeader)
      .query({ source: 'FRONTEND_ERROR' })
      .expect(200);

    const found = listRes.body.items.find((e: { message: string }) => e.message === marker);
    expect(found).toBeDefined();
    expect(found.source).toBe('FRONTEND_ERROR');
    expect(found.resolved).toBe(false);
  });

  // ── (f) Rate limiting — dakikada 10 istek ─────────────────────────────────

  it('POST /errors/frontend — dakikada 10 istek sınırını aşınca 429 döner', async () => {
    // Bu suite'te şimdiye kadar atılan istek sayısı ne olursa olsun, tam
    // sınıra kadar (10.) başarılı, 11. istek 429 dönmeli.
    const remaining = 10 - requestCount;
    expect(remaining).toBeGreaterThan(0);

    for (let i = 0; i < remaining; i++) {
      const res = await postError({ message: `${runPrefix}-RATE-${i}`, url: '/test' });
      expect(res.status).toBe(201);
    }

    const overLimitRes = await postError({ message: `${runPrefix}-RATE-OVER`, url: '/test' });
    expect(overLimitRes.status).toBe(429);
  });
});
