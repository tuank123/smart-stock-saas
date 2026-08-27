/**
 * Raporlar (reports.controller.ts) — günlük/aylık rapor üretimi, listeleme,
 * tekil erişim ve fiyat anomalileri. Controller sınıf-seviyesinde
 * @Roles(PATRON) — SUBE_MUDURU DAHİL hiçbir başka rol erişemez (stock/
 * orders/portal'daki "tek şubeli PATRON = fiili şube müdürü" istisnası
 * BURADA YOK, plan kontrolü de yok — her PATRON, plan fark etmeksizin
 * erişebilir).
 *
 * "Günlük Rapor" burada stock.controller.ts'teki `:branchId/daily-report`
 * (satış özeti) İLE KARIŞTIRILMAMALI — bu, farklı bir backend özelliği
 * (ScheduledReport tablosu, sipariş/stok-hareketi/anomali özetleri).
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

describe('Raporlar / Reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx1: SignedUpContext;
  let ctx2: SignedUpContext;
  let authHeader1: string;
  let subeAuthHeader1: string;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx1 = await signupAndGetContext(app);
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
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  // ── (a) Yetkisiz rol reddi ────────────────────────────────────────────────

  it('POST /reports/generate/daily — SUBE_MUDURU rolüyle 403 döner (yalnızca PATRON)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/reports/generate/daily')
      .set('Authorization', subeAuthHeader1)
      .send({})
      .expect(403);
  });

  it('GET /reports — SUBE_MUDURU rolüyle 403 döner', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set('Authorization', subeAuthHeader1)
      .expect(403);
  });

  // ── (b) Günlük rapor üretimi ──────────────────────────────────────────────

  let dailyReportId: string;

  it('POST /reports/generate/daily — PATRON için doğru şekilde üretir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/reports/generate/daily')
      .set('Authorization', authHeader1)
      .send({})
      .expect(201);

    expect(res.body.reportType).toBe('DAILY');
    expect(res.body.tenantId).toBe(ctx1.tenantId);
    expect(res.body.payload.branches.some((b: { branchId: string }) => b.branchId === ctx1.branchId)).toBe(true);
    expect(typeof res.body.payload.totals.totalOrders).toBe('number');
    dailyReportId = res.body.id;
  });

  // ── (c) Aylık rapor üretimi ───────────────────────────────────────────────

  let monthlyReportId: string;

  it('POST /reports/generate/monthly — PATRON için doğru şekilde üretir', async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const res = await request(app.getHttpServer())
      .post('/api/v1/reports/generate/monthly')
      .set('Authorization', authHeader1)
      .send({ year, month })
      .expect(201);

    expect(res.body.reportType).toBe('MONTHLY');
    expect(res.body.payload.period).toBe(`${year}-${String(month).padStart(2, '0')}`);
    monthlyReportId = res.body.id;
  });

  // ── (d) Anomaliler ────────────────────────────────────────────────────────

  it('GET /reports/anomalies — dizi döner', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/reports/anomalies')
      .set('Authorization', authHeader1)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── (e) Listeleme + tekil erişim — tenant izolasyonu ─────────────────────

  it('GET /reports — üretilen DAILY ve MONTHLY raporlar listede görünür, başka tenant\'ınki sızmaz', async () => {
    const authHeader2 = `Bearer ${ctx2.accessToken}`;
    await request(app.getHttpServer())
      .post('/api/v1/reports/generate/daily')
      .set('Authorization', authHeader2)
      .send({})
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set('Authorization', authHeader1)
      .expect(200);

    const ids = res.body.map((r: { id: string }) => r.id);
    expect(ids).toContain(dailyReportId);
    expect(ids).toContain(monthlyReportId);
    expect(res.body.every((r: { id: string }) => r.id !== undefined)).toBe(true);

    // ctx2'nin raporu ctx1'in listesinde OLMAMALI (id'ler farklı tenant'a ait).
    const res2 = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set('Authorization', authHeader2)
      .expect(200);
    const ctx2ReportId = res2.body[0].id;
    expect(ids).not.toContain(ctx2ReportId);
  });

  it('GET /reports/:id — kendi raporunu görebilir, isRead işaretlenir', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/reports/${dailyReportId}`)
      .set('Authorization', authHeader1)
      .expect(200);
    expect(res.body.id).toBe(dailyReportId);
    expect(res.body.isRead).toBe(true);
    expect(res.body.readAt).not.toBeNull();
  });

  it('GET /reports/:id — başka tenant\'ın raporuna erişim 404 döner', async () => {
    const authHeader2 = `Bearer ${ctx2.accessToken}`;
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/reports')
      .set('Authorization', authHeader2)
      .expect(200);
    const ctx2ReportId = listRes.body[0].id;

    await request(app.getHttpServer())
      .get(`/api/v1/reports/${ctx2ReportId}`)
      .set('Authorization', authHeader1)
      .expect(404);
  });
});
