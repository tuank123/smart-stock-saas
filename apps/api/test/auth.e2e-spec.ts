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
import { withTenantContext } from '../src/common/utils/tenant-context';

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
    const user = await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
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

    const record = await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
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

    const record = await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
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

  // ── RLS bağlam sızıntısı regresyonu ─────────────────────────────────────
  //
  // getMe/login/refreshToken/changePassword/verifyPassword'ın hepsi, RLS
  // altındaki users/tenants tablolarını sorgulamadan ÖNCE app.tenant_id /
  // app.is_super_admin set etmiyordu (yalnızca bu metotlar — codebase'in
  // geri kalanı bunu tutarlı yapıyor). Postgres'te düz SET, SET LOCAL gibi
  // transaction'a değil SESSION'a/bağlantıya bağlı olduğundan, bu havuzlanmış
  // bir bağlantıda ÖNCEKİ bir isteğin bıraktığı BAŞKA bir tenant'ın
  // app.tenant_id değerini "miras alıp" o kullanıcıyı RLS'in sessizce
  // görünmez kılmasına (404/başarısız) yol açabiliyordu. Bunu CI'da (RLS
  // gerçekten zorlanan ortam) yakalayan gerçek bir başarısızlık zaten oldu
  // (bkz. staff-registration.e2e-spec.ts'in cross-tenant testi). Aşağıdaki
  // testler her metot için AYNI sızıntıyı elle tetikliyor: hemen öncesinde
  // BAŞKA bir tenant'ın bağlamını "kirleten" bağımsız bir istek atılıyor,
  // sonra hedef metot doğru tenant'ın sonucunu döndürüyor mu diye bakılıyor.
  //
  // NOT: Yerelde RLS bypass edildiği için (stok_user superuser/sahip) bu
  // testler yerelde sızıntı olsa bile geçer — asıl garanti CI'da devreye
  // girer. Yine de düzeltmenin regresyona karşı kalıcı bir bekçisi olarak
  // burada duruyorlar.
  describe('RLS bağlam sızıntısı regresyonu (getMe/refresh/changePassword/verifyPassword)', () => {
    let ctxA: { payload: ReturnType<typeof signupPayload>; accessToken: string; refreshToken: string };
    let ctxB: { payload: ReturnType<typeof signupPayload>; accessToken: string; refreshToken: string };

    beforeAll(async () => {
      // NOT: POST /auth/login yerine signup'ın kendi döndürdüğü token'lar
      // kullanılıyor (tıpkı setup.ts → signupAndGetContext gibi) — bu dosyada
      // /auth/login zaten @Throttle(5/15dk) bütçesinin 4/5'ini önceki
      // testlerde tüketmiş durumda, burada login() çağırmak dosyanın geri
      // kalanını 429'a düşürür. Signup, login ile birebir aynı buildAuthData
      // yolunu kullanıyor (bkz. tenants.controller.ts) — X-Client-Platform:
      // native ile refreshToken body'de de dönüyor.
      const payloadA = signupPayload();
      const payloadB = signupPayload();

      const signupA = await request(app.getHttpServer())
        .post('/api/v1/tenants/signup')
        .set('X-Client-Platform', 'native')
        .send(payloadA)
        .expect(201);
      createdTaxNumbers.push(payloadA.taxNumber);

      const signupB = await request(app.getHttpServer())
        .post('/api/v1/tenants/signup')
        .set('X-Client-Platform', 'native')
        .send(payloadB)
        .expect(201);
      createdTaxNumbers.push(payloadB.taxNumber);

      ctxA = { payload: payloadA, accessToken: signupA.body.data.accessToken, refreshToken: signupA.body.data.refreshToken };
      ctxB = { payload: payloadB, accessToken: signupB.body.data.accessToken, refreshToken: signupB.body.data.refreshToken };
    });

    // "Bağlamı A'ya kirlet" — herhangi bir tenant-scoped uç nokta yeterli;
    // burada A'nın kendi şube listesini okuması app.tenant_id'yi A'ya set eder.
    async function poisonContextWithA(): Promise<void> {
      await request(app.getHttpServer())
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${ctxA.accessToken}`)
        .expect(200);
    }

    it('GET /auth/me — A bağlamı kirletildikten hemen sonra B kendi hesabını doğru görür', async () => {
      await poisonContextWithA();

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${ctxB.accessToken}`)
        .expect(200);

      expect(res.body.user.email).toBe(ctxB.payload.email);
      expect(res.body.tenant.taxNumber).toBe(ctxB.payload.taxNumber);
    });

    it('POST /auth/refresh — A bağlamı kirletildikten hemen sonra B\'nin refresh token\'ı doğru kullanıcıyı döner', async () => {
      await poisonContextWithA();

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: ctxB.refreshToken })
        .expect(200);

      expect(res.body.data.user.email).toBe(ctxB.payload.email);
    });

    it('POST /auth/verify-password — A bağlamı kirletildikten hemen sonra B\'nin şifresi doğru doğrulanır', async () => {
      await poisonContextWithA();

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-password')
        .set('Authorization', `Bearer ${ctxB.accessToken}`)
        .send({ password: ctxB.payload.password })
        .expect(200);

      expect(res.body.valid).toBe(true);
    });

    it('PATCH /auth/change-password — A bağlamı kirletildikten hemen sonra B\'nin şifresi gerçekten kendi hesabında değişir, A etkilenmez', async () => {
      await poisonContextWithA();

      const newPassword = 'YeniSifreB123';
      await request(app.getHttpServer())
        .patch('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${ctxB.accessToken}`)
        .send({ currentPassword: ctxB.payload.password, newPassword })
        .expect(200);

      // Doğrulama /auth/login ÜZERİNDEN YAPILMIYOR — bu dosyada login zaten
      // @Throttle(5/15dk) bütçesinin çoğunu tüketmiş durumda (yukarıdaki
      // testler). Throttle'sız /auth/verify-password ile aynı şeyi kanıtlıyoruz:
      // update GERÇEKTEN B'nin kendi satırına yazılmış (kirlenmiş bağlamda
      // sessizce 0 satır değil) ve A hiç etkilenmemiş.
      const verifyBNew = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-password')
        .set('Authorization', `Bearer ${ctxB.accessToken}`)
        .send({ password: newPassword })
        .expect(200);
      expect(verifyBNew.body.valid).toBe(true);

      const verifyBOld = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-password')
        .set('Authorization', `Bearer ${ctxB.accessToken}`)
        .send({ password: ctxB.payload.password })
        .expect(200);
      expect(verifyBOld.body.valid).toBe(false);

      // A'nın kendi hesabı bu işlemden hiç etkilenmemiş olmalı.
      const verifyAUnchanged = await request(app.getHttpServer())
        .post('/api/v1/auth/verify-password')
        .set('Authorization', `Bearer ${ctxA.accessToken}`)
        .send({ password: ctxA.payload.password })
        .expect(200);
      expect(verifyAUnchanged.body.valid).toBe(true);
    });
  });
});
