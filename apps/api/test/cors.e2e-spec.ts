/**
 * CORS — yalnızca ALLOWED_ORIGINS listesindeki origin'ler
 * Access-Control-Allow-Origin başlığı almalı.
 *
 * Not: CORS bir TARAYICI korumasıdır. İzin verilmeyen origin'den gelen istek
 * yine işlenir (400/401 döner); kritik olan yanıtta ACAO başlığının OLMAMASIDIR
 * — tarayıcı bu durumda yanıtı çağırana vermez. Testler bu yüzden HTTP kodunu
 * değil, başlığın varlığını/değerini doğrular.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup';

const DISALLOWED_ORIGIN = 'http://kotu-site.com';

describe('CORS (e2e)', () => {
  let app: INestApplication;
  let allowedOrigin: string;

  beforeAll(async () => {
    ({ app } = await createTestApp());

    // .env.test'teki ALLOWED_ORIGINS'in ilk girdisi (setup.ts ile aynı mantık).
    allowedOrigin =
      process.env.ALLOWED_ORIGINS?.split(',')
        .map((o) => o.trim())
        .filter(Boolean)[0] ?? 'http://localhost:3001';
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Basit (non-preflight) istekler ──────────────────────────────────────────

  it('izin verilmeyen origin ACAO başlığı ALMAZ', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', DISALLOWED_ORIGIN)
      .send({ email: 'yok@example.test', password: 'Gecersiz123' });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('izin verilmeyen origin yanıtta hiçbir şekilde yansıtılmaz', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', DISALLOWED_ORIGIN)
      .send({ email: 'yok@example.test', password: 'Gecersiz123' });

    // Eski kod her origin'i geri yansıtıyordu; bu testin amacı o regresyonu yakalamak.
    expect(JSON.stringify(res.headers)).not.toContain('kotu-site.com');
  });

  it('izin verilen origin ACAO başlığını alır', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', allowedOrigin)
      .send({ email: 'yok@example.test', password: 'Gecersiz123' });

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  // ── Preflight (asıl tarayıcı kapısı) ────────────────────────────────────────

  it('preflight: izin verilmeyen origin ACAO başlığı ALMAZ', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('Origin', DISALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight: izin verilen origin ACAO ve izinli metotları alır', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
  });
});
