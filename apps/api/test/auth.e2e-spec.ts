/**
 * Auth akışları — bu oturumda elle doğrulanan senaryoların kalıcı hali.
 *
 * Testler kendi hesabını signup ile kendisi oluşturur; seed verisine BAĞLI
 * DEĞİLDİR, böylece boş bir test veritabanında da çalışır. Oluşturulan
 * tenant'lar afterAll'da silinir.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanupTenants,
  signupPayload,
  uniqueSuffix,
} from './setup';
import { PrismaService } from '../src/prisma/prisma.service';

// Şifre kuralı: en az 8 karakter, 1 büyük harf, 1 rakam.
const PASSWORD_RULE_TEXT = 'Şifre en az 8 karakter, 1 büyük harf ve 1 rakam içermelidir.';

// forgot-password'ün e-posta var/yok fark etmeksizin döndüğü tek mesaj.
const GENERIC_FORGOT_MESSAGE =
  'Eğer bu e-posta adresi kayıtlıysa, şifre sıfırlama bağlantısı gönderildi.';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // afterAll'da silinecek tenant'ların vergi numaraları.
  const createdTaxNumbers: string[] = [];

  // (a)/(b) login testlerinin kullandığı hesap.
  const account = signupPayload();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    // Login testleri için bilinen kimlik bilgileriyle bir hesap oluştur.
    await request(app.getHttpServer())
      .post('/api/v1/tenants/signup')
      .send(account)
      .expect(201);

    createdTaxNumbers.push(account.taxNumber);
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  // ── (a) Geçerli kimlik bilgileriyle giriş ───────────────────────────────────

  it('POST /auth/login — geçerli kimlik bilgileriyle 200 ve accessToken döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: account.password })
      .expect(200);

    expect(res.body.message).toBe('Login successful');
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.accessToken.length).toBeGreaterThan(0);
    expect(res.body.data.user.email).toBe(account.email);
    expect(res.body.data.user.role).toBe('PATRON');
  });

  // ── (b) Yanlış şifre ────────────────────────────────────────────────────────

  it('POST /auth/login — yanlış şifreyle 401 döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: 'YanlisSifre123' })
      .expect(401);

    expect(res.body.message).toBe('Invalid credentials');
    expect(res.body).not.toHaveProperty('data');
  });

  // ── (c) Zayıf şifreyle kayıt ────────────────────────────────────────────────

  it('POST /tenants/signup — zayıf şifre 400 ve şifre kuralı mesajı döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenants/signup')
      .send(signupPayload({ password: 'abcdefgh' })) // büyük harf ve rakam yok
      .expect(400);

    const messages: string[] = Array.isArray(res.body.message)
      ? res.body.message
      : [res.body.message];

    expect(messages).toContain(PASSWORD_RULE_TEXT);
  });

  it('POST /tenants/signup — büyük harfi olan ama rakamı olmayan şifre de reddedilir', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/tenants/signup')
      .send(signupPayload({ password: 'Abcdefgh' }))
      .expect(400);

    const messages: string[] = Array.isArray(res.body.message)
      ? res.body.message
      : [res.body.message];

    expect(messages).toContain(PASSWORD_RULE_TEXT);
  });

  // ── (d) Güçlü şifreyle geçerli kayıt ────────────────────────────────────────

  it('POST /tenants/signup — güçlü şifre ve geçerli veriyle 201 döner', async () => {
    const payload = signupPayload({ password: 'Test1234' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/tenants/signup')
      .send(payload)
      .expect(201);

    // Temizlik listesine hemen ekle: alttaki assert'ler patlasa bile silinsin.
    createdTaxNumbers.push(payload.taxNumber);

    expect(res.body.message).toBe('İşletme kaydı başarılı');
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.body.data.user.email).toBe(payload.email);
    expect(res.body.data.user.role).toBe('PATRON');

    // Yeni kullanıcı doğrulanmamış e-posta ile başlar.
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);
      return tx.user.findFirst({
        where: { email: payload.email },
        select: { emailVerified: true },
      });
    });
    expect(user?.emailVerified).toBe(false);
  });

  // ── (e) Şifre sıfırlama — e-posta sızıntısı yok ─────────────────────────────
  //
  // DİKKAT: /auth/forgot-password rotasında @Throttle(3 / 15 dk) var ve
  // throttler IP bazlı. Bu dosyada endpoint'e toplam İKİ istek atılıyor
  // (aşağıdaki test + tam akış testi); yeni forgot-password testi eklerken
  // limiti aşmamaya dikkat edin, yoksa testler 429 alır.

  it('POST /auth/forgot-password — olmayan e-posta için de aynı genel mesajla 200 döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: `yok-${uniqueSuffix()}@example.test` })
      .expect(200);

    // Tam akış testi de aynı sabiti doğruluyor; ikisinin eşit olması
    // "var olan / olmayan e-posta ayırt edilemez" iddiasını kanıtlar.
    expect(res.body.message).toBe(GENERIC_FORGOT_MESSAGE);
  });

  // ── (f) Geçersiz token ile şifre sıfırlama ──────────────────────────────────

  it('POST /auth/reset-password — geçersiz token 400 döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: 'gecersiz-token-' + uniqueSuffix(), newPassword: 'Test1234' })
      .expect(400);

    expect(res.body.message).toBe('Geçersiz veya süresi dolmuş bağlantı');
  });

  it('POST /auth/reset-password — geçerli token ama zayıf şifre 400 (kural doğrulaması)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: 'herhangi-bir-token', newPassword: 'abcdefgh' })
      .expect(400);

    const messages: string[] = Array.isArray(res.body.message)
      ? res.body.message
      : [res.body.message];

    // Şifre kuralı, token kontrolünden ÖNCE (ValidationPipe seviyesinde) çalışır.
    expect(messages).toContain(PASSWORD_RULE_TEXT);
  });

  // ── Tam şifre sıfırlama akışı ───────────────────────────────────────────────

  /**
   * forgot-password → token'ı DB'den oku → reset-password → yeni şifreyle giriş.
   * Mock e-posta yalnızca loglandığı için token log yerine DB'den alınır.
   * Bu, forgot-password'e atılan İKİNCİ (ve son) istektir — throttle notuna bakın.
   */
  it('şifre sıfırlama akışı uçtan uca çalışır ve token tek kullanımlıktır', async () => {
    const payload = signupPayload();
    await request(app.getHttpServer())
      .post('/api/v1/tenants/signup')
      .send(payload)
      .expect(201);
    createdTaxNumbers.push(payload.taxNumber);

    const forgot = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: payload.email })
      .expect(200);

    // Var olan e-posta, olmayanla birebir aynı mesajı döner (sızıntı yok).
    expect(forgot.body.message).toBe(GENERIC_FORGOT_MESSAGE);

    const record = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);
      const user = await tx.user.findFirst({
        where: { email: payload.email },
        select: { id: true },
      });
      return tx.passwordResetToken.findFirst({
        where: { userId: user!.id, used: false },
        select: { token: true },
      });
    });
    expect(record?.token).toBeDefined();

    const newPassword = 'YeniSifre123';

    const reset = await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: record!.token, newPassword })
      .expect(200);
    expect(reset.body.message).toBe(
      'Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.',
    );

    // Yeni şifre çalışır.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: newPassword })
      .expect(200);

    // Eski şifre artık çalışmaz.
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: payload.password })
      .expect(401);

    // Aynı token ikinci kez kullanılamaz (used: true).
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: record!.token, newPassword: 'BaskaSifre456' })
      .expect(400);
  });

  // ── E-posta doğrulama ───────────────────────────────────────────────────────

  it('POST /auth/verify-email — geçersiz token 400 döner', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: 'gecersiz-token-' + uniqueSuffix() })
      .expect(400);

    expect(res.body.message).toBe('Geçersiz veya süresi dolmuş doğrulama bağlantısı');
  });

  it('POST /auth/resend-verification — JWT olmadan 401 döner', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/resend-verification')
      .expect(401);
  });

  /**
   * Uçtan uca e-posta doğrulama: token'ı DB'den okuyup verify-email'e gönderir.
   * (Mock e-posta yalnızca loglandığı için token log yerine DB'den alınır.)
   */
  it('POST /auth/verify-email — geçerli token e-postayı doğrular ve token tek kullanımlıktır', async () => {
    const payload = signupPayload();
    await request(app.getHttpServer())
      .post('/api/v1/tenants/signup')
      .send(payload)
      .expect(201);
    createdTaxNumbers.push(payload.taxNumber);

    const record = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);
      const user = await tx.user.findFirst({
        where: { email: payload.email },
        select: { id: true },
      });
      return tx.emailVerificationToken.findFirst({
        where: { userId: user!.id },
        select: { token: true },
      });
    });

    // Signup sonrası doğrulama token'ı üretilmiş olmalı.
    expect(record?.token).toBeDefined();

    const ok = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: record!.token })
      .expect(200);
    expect(ok.body.message).toBe('E-posta adresiniz doğrulandı.');

    // Aynı token ikinci kez kabul edilmemeli (kayıt siliniyor).
    await request(app.getHttpServer())
      .post('/api/v1/auth/verify-email')
      .send({ token: record!.token })
      .expect(400);
  });
});
