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
 * RLS bağlamını (app.tenant_id / app.is_super_admin) mevcut bir transaction
 * İÇİNDE, SET LOCAL ile kurar — SET'in aksine COMMIT/ROLLBACK'te otomatik
 * sıfırlanır, bağlantı havuzunda başka bir transaction'a SIZAMAZ (yerel
 * psql deneyiyle doğrulandı: aynı fiziksel bağlantıda TX1'de SET LOCAL,
 * COMMIT sonrası TX2'de current_setting(...) NULL döner; düz SET aynı
 * senaryoda TX2'ye sızar).
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
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${ctx.tenantId}'`);
  }
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
