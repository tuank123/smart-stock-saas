import { Prisma, PrismaClient } from '@prisma/client';

/**
 * PrismaService (uygulama kodu) $transaction'ı olan herhangi bir Prisma
 * client'ından (PrismaClient, testlerde ayrı bir bağlantı_limit=1'lik
 * client'tan) geçirilebilsin diye somut PrismaService sınıfı yerine yapısal
 * tip kullanılıyor — bu, izolasyon garantisini gerçek DI olmadan test
 * edebilmeyi sağlıyor.
 */
type TransactionalClient = Pick<PrismaClient, '$transaction'>;

/**
 * Basit UUID v1-v5 formatı doğrulaması. `SET LOCAL app.tenant_id = '${tenantId}'`
 * ile ham string interpolasyonuna geçmeden önce hem SQL injection'a hem de
 * (debts.service.ts vakasında görüldüğü gibi) boş/bozuk değerlerin sessizce
 * RLS policy'sinde "invalid input syntax for type uuid" hatasına dönüşmesine
 * karşı savunma.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidTenantId(tenantId: string): void {
  if (!UUID_RE.test(tenantId)) {
    throw new Error(
      `setTenantContext: geçersiz tenantId ("${tenantId}") — UUID formatında olmalı`,
    );
  }
}

export interface TenantContext {
  /** Bypass edilmiyorsa (isSuperAdmin=false/undefined) zorunlu. */
  tenantId?: string | null;
  isSuperAdmin?: boolean;
}

/**
 * tenantId verilmeyen (isSuperAdmin-only) çağrılarda app.tenant_id'ye
 * atanan sabit, geçerli-UUID-biçimli "boş" değer. Gerçek bir tenant'a hiç
 * karşılık gelmez (nil UUID) — yalnızca RLS policy'sindeki
 * `id = current_setting('app.tenant_id')::uuid` ifadesinin GEÇERLİ bir uuid
 * ile karşılaşmasını garanti eder. Neden gerekli, aşağıdaki ana yorumda.
 */
const NIL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * RLS bağlamını (app.tenant_id / app.is_super_admin) mevcut bir transaction
 * İÇİNDE, SET LOCAL ile kurar.
 *
 * KRİTİK — SET LOCAL'in gerçek davranışı, custom (app.* gibi yerleşik
 * olmayan) GUC'larda beklenenden FARKLI: bir bağlantıda app.tenant_id İLK
 * KEZ SET LOCAL ile atandığında, bu transaction COMMIT olsa BİLE (ROLLBACK
 * bile gerekmiyor) current_setting('app.tenant_id', true) bir daha ASLA
 * gerçek NULL'a dönmüyor — o bağlantı kapanana kadar KALICI OLARAK boş
 * string ('') döndürüyor. Ne RESET app.tenant_id, ne SET LOCAL ... TO
 * DEFAULT, ne sonraki başarılı SET LOCAL + COMMIT'ler bunu düzeltiyor.
 * (Yerelde superuser/RLS-bypass olmayan kısıtlı bir rolle ampirik olarak
 * doğrulandı — bkz. test/tenant-context.e2e-spec.ts'teki regresyon testi.)
 *
 * Sonuç: tenantId verilmeden yalnızca is_super_admin SET LOCAL edilen bir
 * çağrı (login/forgotPassword/findUserByIdGlobal gibi ~15 çağrı noktası),
 * DAHA ÖNCE aynı bağlantıda BİR KEZ bile gerçek bir tenant bağlamı
 * kurulmuşsa (ki normal kullanımda kaçınılmaz), RLS policy'sinin
 * `id = current_setting('app.tenant_id')::uuid OR is_super_admin='true'`
 * ifadesinin SOL tarafında ''::uuid cast hatasıyla çöküyordu — is_super_admin
 * doğru şekilde 'true' olsa BİLE (Postgres OR'da short-circuit garantisi
 * yok, sol taraf yine değerlendirilip patlıyor).
 *
 * DÜZELTME: tenantId verilmediğinde bile app.tenant_id HER ZAMAN açıkça
 * SET LOCAL edilir — geçerli ama gerçek hiçbir tenant'a karşılık gelmeyen
 * NIL_TENANT_ID ile. Böylece sol taraf her zaman GEÇERLİ bir uuid'e cast
 * olur (false'a eşitlenir, hata fırlatmaz), sağ taraftaki is_super_admin
 * kontrolü normal şekilde devreye girer. Bu garanti merkezi olarak BURADA
 * veriliyor — çağıranların tenantId'yi unutup unutmadığını hesaba katmaya
 * gerek yok.
 *
 * Mevcut $transaction bloklarına minimum değişiklikle entegre olması için
 * tasarlandı: önceki iki `tx.$executeRawUnsafe('SET app.xxx = ...')` satırı
 * tek bir `await setTenantContext(tx, { tenantId, isSuperAdmin })` çağrısıyla
 * değiştirilir — transaction'ın kendisi (yapısı, gövdesi) AYNEN kalır. Bir
 * transaction içinde bağlam birden fazla kez değişiyorsa (ör. tenants.service
 * .ts'teki signup akışı: önce is_super_admin, sonra tenant bağlamı) bu
 * fonksiyon o transaction içinde İSTENEN her noktada tekrar çağrılabilir.
 */
export async function setTenantContext(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
): Promise<void> {
  const isSuperAdmin = ctx.isSuperAdmin ?? false;

  // Boş/eksik tenantId'yi sessizce SET'i atlayarak yutmak, debts.service.ts
  // CI vakasındaki gibi RLS'in sessizce 0 satır döndürmesine (ya da düz SET
  // kullanılsaydı bozuk bir eski bağlamın sızmasına) yol açardı. isSuperAdmin
  // değilse tenantId ZORUNLU — burada gürültülü ve hemen patlamalı.
  if (!isSuperAdmin && !ctx.tenantId) {
    throw new Error(
      'setTenantContext: tenantId zorunlu (isSuperAdmin=true değilse) — boş/eksik tenantId ile RLS bağlamı kurulamaz',
    );
  }
  if (ctx.tenantId) {
    assertValidTenantId(ctx.tenantId);
  }
  const tenantIdToSet = ctx.tenantId || NIL_TENANT_ID;
  await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantIdToSet}'`);
  await tx.$executeRawUnsafe(`SET LOCAL app.is_super_admin = '${isSuperAdmin}'`);
}

/**
 * setTenantContext'in "tek bağlamlı, tüm transaction boyunca geçerli" ortak
 * durumu için kısayolu: $transaction'ı kendisi açar, bağlamı SET LOCAL ile
 * kurar, callback'i tx ile çağırır. Servislerin BÜYÜK ÇOĞUNLUĞUndaki
 *
 *   return this.prisma.$transaction(async (tx) => {
 *     await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
 *     await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
 *     ...gövde (tx kullanıyor)...
 *   });
 *
 * deseniyle bire bir örtüşür — yalnızca ilk üç satır şu şekilde değişir:
 *
 *   return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
 *     ...gövde (DEĞİŞMEDEN, aynen kalır)...
 *   });
 *
 * Bağlam transaction ortasında değişen (tenants.service.ts gibi) servisler
 * için UYGUN DEĞİL — onlar için tx içinde birden fazla kez setTenantContext
 * çağrısı kullanılmalı.
 */
export async function withTenantContext<T>(
  prisma: TransactionalClient,
  ctx: TenantContext,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await setTenantContext(tx, ctx);
    return callback(tx);
  });
}
