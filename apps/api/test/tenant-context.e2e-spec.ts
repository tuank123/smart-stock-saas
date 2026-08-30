/**
 * setTenantContext / withTenantContext (common/utils/tenant-context.ts) için
 * doğrulama. Faz 2/3'te tüm codebase'e (~280 çağrı noktası) uygulandı — bu
 * dosyadaki testler hem yardımcının kendisini (birim düzeyi, saf Prisma) hem
 * de en alttaki describe bloğunda GERÇEK servis katmanı üzerinden uçtan uca
 * bağlantı-havuzu sızıntı senaryosunu kapsıyor.
 *
 * Asıl kanıtlanması gereken şey: SET LOCAL, COMMIT/ROLLBACK'te otomatik
 * sıfırlanır ve bağlantı havuzunda AYNI fiziksel bağlantıyı yeniden kullanan
 * SONRAKİ, İLGİSİZ bir transaction'a SIZMAZ — düz SET'in (Faz 2 öncesi ~280
 * çağrı noktasındaki hatalı desen) tam olarak yaptığı şey bu sızmaydı ve
 * CI'da gerçek bir "invalid input syntax for type uuid" çökmesine yol açmıştı.
 *
 * Bunu deterministik test edebilmek için connection_limit=1 ile AYRI, tek
 * bağlantılı bir PrismaClient (ya da createTestApp({singleConnection:true})
 * ile tek bağlantılı bir NestJS app) kullanılıyor — aksi halde Prisma'nın
 * normal havuzu (birden fazla fiziksel bağlantı) testin şans eseri farklı
 * bağlantılara düşüp yanlışlıkla "izole" görünmesine yol açabilirdi.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  setTenantContext,
  withTenantContext,
} from '../src/common/utils/tenant-context';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  cleanupTenants,
  signupAndGetContext,
  uniqueSuffix,
  type SignedUpContext,
} from './setup';

interface ContextRow {
  tenant_id: string | null;
  is_super_admin: string | null;
}

describe('tenant-context (setTenantContext / withTenantContext)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) throw new Error('DATABASE_URL tanımsız (test/load-env.ts kontrol et)');
    const singleConnUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}connection_limit=1`;
    prisma = new PrismaClient({ datasources: { db: { url: singleConnUrl } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function readContext(tx: PrismaClient | Prisma.TransactionClient): Promise<ContextRow> {
    const rows = (await tx.$queryRawUnsafe(
      `SELECT current_setting('app.tenant_id', true) AS tenant_id, current_setting('app.is_super_admin', true) AS is_super_admin`,
    )) as ContextRow[];
    return rows[0];
  }

  const FAKE_TENANT_ID = '11111111-1111-1111-1111-111111111111';

  it('setTenantContext: tx içinde değerler doğru görünür', async () => {
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, { tenantId: FAKE_TENANT_ID, isSuperAdmin: false });
      const ctx = await readContext(tx);
      expect(ctx.tenant_id).toBe(FAKE_TENANT_ID);
      expect(ctx.is_super_admin).toBe('false');
    });
  });

  it('setTenantContext: isSuperAdmin=true, tenantId verilmezse is_super_admin=true VE tenant_id nil-UUID olarak set edilir', async () => {
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, { isSuperAdmin: true });
      const ctx = await readContext(tx);
      expect(ctx.is_super_admin).toBe('true');
      // tenant_id "boş/unset" BIRAKILMAZ — CI run #19 regresyonu (bkz. dosya
      // sonu): SET LOCAL, custom bir GUC'u COMMIT sonrası bile gerçek NULL'a
      // değil kalıcı boş string'e döndürüyor; tenantId verilmediğinde bile
      // HER ZAMAN geçerli bir nil-UUID set edilerek bu tuzak merkezi olarak
      // engellenir.
      expect(ctx.tenant_id).toBe('00000000-0000-0000-0000-000000000000');
    });
  });

  it('SET LOCAL: COMMIT sonrası AYNI fiziksel bağlantıda bile bağlam SIZMAZ (asıl garanti)', async () => {
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, { tenantId: FAKE_TENANT_ID, isSuperAdmin: false });
      const ctx = await readContext(tx);
      expect(ctx.tenant_id).toBe(FAKE_TENANT_ID);
    });

    // Yeni, ayrı bir transaction — connection_limit=1 olduğu için Prisma
    // BURADA AYNI fiziksel bağlantıyı tekrar kullanmak zorunda.
    // setTenantContext hiç çağrılmadı: eski bağlamdan hiçbir iz kalmamalı.
    await prisma.$transaction(async (tx) => {
      const ctx = await readContext(tx);
      expect(ctx.tenant_id).toBeFalsy();
      expect(ctx.is_super_admin).toBeFalsy();
    });
  });

  it('KIYASLAMA — düz SET (eski/hatalı desen) AYNI senaryoda gerçekten SIZAR (test metodolojisinin geçerliliğini kanıtlar)', async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${FAKE_TENANT_ID}'`);
    });

    await prisma.$transaction(async (tx) => {
      const ctx = await readContext(tx);
      // Bilerek: SET LOCAL kullanılmadığı için önceki transaction'ın izi kaldı.
      expect(ctx.tenant_id).toBe(FAKE_TENANT_ID);
    });

    // Test kirliliğini bir sonraki teste taşımamak için temizle.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = ''`);
    });
  });

  it('withTenantContext: transaction açar, bağlamı kurar, callback\'in dönüş değerini iletir', async () => {
    const result = await withTenantContext(prisma, { tenantId: FAKE_TENANT_ID }, async (tx) => {
      const ctx = await readContext(tx);
      expect(ctx.tenant_id).toBe(FAKE_TENANT_ID);
      return 'callback-sonucu';
    });
    expect(result).toBe('callback-sonucu');

    // withTenantContext'in kendi transaction'ı da COMMIT'te sıfırlanmalı.
    await prisma.$transaction(async (tx) => {
      const ctx = await readContext(tx);
      expect(ctx.tenant_id).toBeFalsy();
    });
  });

  it('geçersiz tenantId (boş string veya UUID olmayan) senkron biçimde reddedilir, SQL hiç çalışmaz', async () => {
    await prisma.$transaction(async (tx) => {
      await expect(setTenantContext(tx, { tenantId: 'gecersiz-deger' })).rejects.toThrow(
        /geçersiz tenantId/,
      );
      // is_super_admin dahi set edilmemiş olmalı (fonksiyon tenantId
      // doğrulamasında en baştan durdu).
      const ctx = await readContext(tx);
      expect(ctx.is_super_admin).toBeFalsy();
    });
  });

  it('tenantId boş string olduğunda (debts.e2e-spec.ts CI vakasındaki tam senaryo) sessizce yutulmaz, GÜRÜLTÜLÜ reddedilir', async () => {
    await prisma.$transaction(async (tx) => {
      // isSuperAdmin=false iken boş tenantId, RLS'in sessizce 0 satır
      // döndürmesi (ya da düz SET ile eski bir bağlamın sızması) yerine
      // burada, SQL'e hiç ulaşmadan, net bir hatayla reddedilmeli.
      await expect(setTenantContext(tx, { tenantId: '', isSuperAdmin: false })).rejects.toThrow(
        /tenantId zorunlu/,
      );
      const ctx = await readContext(tx);
      expect(ctx.is_super_admin).toBeFalsy();
    });
  });

  // ── CI run #19 regresyonu ────────────────────────────────────────────────
  //
  // Kök neden (ampirik olarak kısıtlı, RLS-bypass'sız bir rolle doğrulandı):
  // SET LOCAL app.tenant_id = X, transaction COMMIT olsa BİLE (ROLLBACK bile
  // gerekmiyor), current_setting('app.tenant_id', true)'ü bir daha ASLA
  // gerçek NULL'a döndürmüyor — bağlantı kapanana kadar KALICI olarak boş
  // string ('') döndürüyor. tenantId verilmeyen (isSuperAdmin-only) sonraki
  // bir çağrı bu boş string'i ASLA resetlemediği için, RLS policy'sindeki
  // `id = current_setting('app.tenant_id')::uuid OR is_super_admin='true'`
  // ifadesinin SOL tarafı ''::uuid cast hatasıyla çöküyordu — is_super_admin
  // doğru şekilde 'true' olsa bile (Postgres OR'da short-circuit garantisi
  // yok). Bu, CI'da 20/21 test suite'inin aynı anda çökmesine yol açtı.
  it('setTenantContext: tenantId verilmeyen (isSuperAdmin-only) çağrı, AYNI bağlantıda ÖNCEDEN gerçek bir tenant bağlamı kurulmuş olsa bile ASLA uuid cast hatası vermez', async () => {
    // 1) Önce GERÇEK bir tenant-scoped çağrı — normal signup/login akışıyla
    //    birebir aynı, başarıyla COMMIT olur.
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, { tenantId: FAKE_TENANT_ID, isSuperAdmin: false });
    });

    // 2) SONRA, AYNI (tek, connection_limit=1) bağlantıda, tenantId
    //    VERİLMEDEN yalnızca isSuperAdmin ile bir çağrı — login/
    //    findUserByIdGlobal/forgotPassword deseninin birebir aynısı.
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, { isSuperAdmin: true });

      // Asıl kanıt: RLS policy'sinin birebir yaptığı şeyi (current_setting
      // sonucunu ::uuid'e cast etmeyi) doğrudan tetikliyoruz. Eski kodda bu
      // satır "invalid input syntax for type uuid" ile PATLIYORDU.
      const rows = await tx.$queryRawUnsafe<{ tenant_id_as_uuid: string }[]>(
        `SELECT current_setting('app.tenant_id', true)::uuid AS tenant_id_as_uuid`,
      );
      expect(rows[0].tenant_id_as_uuid).toBe('00000000-0000-0000-0000-000000000000');
    });
  });
});

/**
 * Bağlantı havuzu sızıntı simülasyonu — GERÇEK servis katmanı üzerinden
 * (HTTP → controller → service → withTenantContext), mock yok.
 *
 * createTestApp({singleConnection:true}) ile TÜM bu describe bloğu boyunca
 * uygulamanın Prisma havuzu tam olarak BİR fiziksel bağlantıya sabitleniyor.
 * Bu, gerçek üretim/CI ortamındaki "farklı isteklerin aynı pooled bağlantıyı
 * paylaşması" senaryosunun EN KÖTÜ (garantili) hali — normal bir havuzda
 * (birden fazla bağlantı) sızıntı şansa bağlı olur ve testi yanlışlıkla
 * yeşil gösterebilirdi.
 *
 * İki kontrol katmanı var:
 *  1) HTTP yanıtı — B'nin isteği SADECE kendi şubesini görüyor mu (RLS'e
 *     bağlı; yerelde stok_user superuser/sahip olduğu için RLS bypass edilir,
 *     bu yüzden TEK BAŞINA yerelde güvenilir değil — bkz. auth.e2e-spec.ts'
 *     teki "RLS bağlam sızıntısı regresyonu" bloğundaki aynı not).
 *  2) Ham SQL session kontrolü — her istekten HEMEN SONRA, AYNI bağlantıda
 *     current_setting('app.tenant_id') gerçekten NULL'a dönmüş mü. Bu, RLS'e
 *     HİÇ bağlı değil — doğrudan Postgres'in SET LOCAL/COMMIT mekaniğini
 *     ölçüyor, bu yüzden yerelde de (RLS bypass olsa dahi) eski/hatalı düz
 *     SET deseniyle GERÇEKTEN başarısız olur. Asıl garanti katman #2'dir.
 */
describe('Bağlantı havuzu sızıntı simülasyonu — gerçek HTTP üzerinden (Faz 3 regresyonu)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctxA: SignedUpContext;
  let ctxB: SignedUpContext;
  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ singleConnection: true }));

    ctxA = await signupAndGetContext(app, { branchName: `SizintiA-${uniqueSuffix()}` });
    createdTaxNumbers.push(ctxA.payload.taxNumber);

    ctxB = await signupAndGetContext(app, { branchName: `SizintiB-${uniqueSuffix()}` });
    createdTaxNumbers.push(ctxB.payload.taxNumber);
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  async function currentSessionTenantId(): Promise<string | null> {
    const rows = await prisma.$queryRawUnsafe<{ tenant_id: string | null }[]>(
      `SELECT current_setting('app.tenant_id', true) AS tenant_id`,
    );
    return rows[0]?.tenant_id || null;
  }

  // "ctx" isteği atar, yalnızca KENDİ şubesini gördüğünü ve isteğin AYNI
  // bağlantıda hiçbir iz bırakmadığını doğrular.
  async function requestAndVerifyIsolated(ctx: SignedUpContext, other: SignedUpContext) {
    const res = await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .expect(200);

    const branches = res.body as Array<{ id: string; tenantId: string; name: string }>;
    expect(branches.length).toBeGreaterThan(0);
    expect(branches.every((b) => b.tenantId === ctx.tenantId)).toBe(true);
    expect(branches.some((b) => b.tenantId === other.tenantId)).toBe(false);
    expect(branches.some((b) => b.name === other.payload.branchName)).toBe(false);

    // Asıl garanti: commit sonrası AYNI fiziksel bağlantıda session sıfır.
    const leaked = await currentSessionTenantId();
    expect(leaked).toBeFalsy();
  }

  it('10 tur A→B→A→B... art arda, TEK fiziksel bağlantı üzerinden, hiç cross-tenant sızıntı olmaz', async () => {
    for (let round = 0; round < 10; round++) {
      await requestAndVerifyIsolated(ctxA, ctxB);
      await requestAndVerifyIsolated(ctxB, ctxA);
    }
  });
});
