/**
 * e2e test yardımcıları.
 *
 * createTestApp(), main.ts'teki bootstrap yapılandırmasının AYNISINI uygular
 * (cookie-parser, CORS, global prefix + versioning, ValidationPipe, body
 * parser + rawBody yakalama). Aksi halde testler gerçek uygulamadan farklı
 * bir pipeline'ı test etmiş olurdu: doğrulama hataları 400 yerine 201
 * dönerdi, rotalar /api/v1 önekini almazdı, ya da WhatsappSignatureGuard'ın
 * okuduğu req.rawBody hiç dolmazdı (bkz. main.ts BODY SIZE LIMIT yorumu).
 *
 * Global guard'lar (Throttler, JWT, Tenant, Roles) ve exception filter'ı
 * AppModule'de APP_GUARD/APP_FILTER ile tanımlı olduğu için otomatik gelir.
 */
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as bodyParser from 'body-parser';
import type { IncomingMessage } from 'http';
import * as bcrypt from 'bcrypt';
import { createClient } from 'redis';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { withTenantContext } from '../src/common/utils/tenant-context';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

/** main.ts ile aynı CORS yapılandırması. */
function allowedOrigins(): string[] {
  return (
    process.env.ALLOWED_ORIGINS?.split(',')
      .map((o) => o.trim())
      .filter(Boolean) ?? ['http://localhost:3001']
  );
}

/**
 * singleConnection: true iken PrismaService, DATABASE_URL'e
 * `connection_limit=1` ekleyerek kurulur — Prisma'nın bu app instance'ı
 * boyunca AYNI fiziksel Postgres bağlantısını yeniden kullanmak ZORUNDA
 * kalmasını sağlar. Bağlantı-havuzu sızıntı senaryolarını (bkz.
 * tenant-context.e2e-spec.ts) deterministik test etmek için kullanılır —
 * normal (havuzlu) bir app'te sızıntı şansa bağlı olur, burada garantiye alınır.
 */
export async function createTestApp(
  options: { singleConnection?: boolean } = {},
): Promise<TestContext> {
  let testModuleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (options.singleConnection) {
    testModuleBuilder = testModuleBuilder.overrideProvider(PrismaService).useFactory({
      factory: (configService: ConfigService) => {
        const baseUrl = configService.get<string>('DATABASE_URL') as string;
        const singleConnUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}connection_limit=1`;
        const patchedConfig = {
          get: (key: string, def?: unknown) =>
            key === 'DATABASE_URL' ? singleConnUrl : configService.get(key, def as never),
        } as ConfigService;
        return new PrismaService(patchedConfig);
      },
      inject: [ConfigService],
    });
  }

  const moduleRef = await testModuleBuilder.compile();

  // bodyParser:false — main.ts ile aynı gerekçe: Nest'in kendi varsayılan
  // body-parser'ı devre dışı, aşağıdaki manuel json()/urlencoded() çağrıları
  // kullanılıyor. Bu, WhatsappSignatureGuard'ın okuduğu req.rawBody'nin
  // testlerde de gerçekten dolduğundan emin olmanın tek yolu.
  const app = moduleRef.createNestApplication({ bodyParser: false });

  app.use(cookieParser());

  // main.ts BODY SIZE LIMIT ile birebir aynı — 'verify' ham gövdeyi
  // req.rawBody'e yazar (yalnızca WhatsappSignatureGuard okur), diğer tüm
  // endpoint'ler için davranış/limit değişmez.
  app.use(
    bodyParser.json({
      limit: '10mb',
      verify: (req: IncomingMessage & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  app.enableCors({
    origin: allowedOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Platform'],
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

/** Testler arasında çakışmayan e-posta/vergi no üretir. */
export function uniqueSuffix(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/**
 * Test tenant'ını ve ona bağlı her şeyi siler.
 *
 * users/branches FK'de onDelete: Cascade tanımlı, ama diğer birçok tablo
 * (debts, stock_levels, stock_movements, ocr_scans, cashier_sessions,
 * products, categories, suppliers, ...) tenant_id/branch_id'ye karşı
 * ON DELETE RESTRICT ile bağlı — migration SQL'inden doğrulandı, Prisma
 * şemasında onDelete belirtilmeyen ilişkilerin varsayılanı bu. Yani bu
 * tablolarda satır varken doğrudan `tenant.delete()` FK ihlaliyle patlar
 * (ya da Branch'in CASCADE'i tetiklendiğinde branch_id RESTRICT'lerine takılır).
 *
 * Bu yüzden RESTRICT ile bağlı her şey, çocuktan ebeveyne doğru, tenant/branch
 * silinmeden ÖNCE elle temizlenir. Bu tablolarda RLS YOK (yalnızca tenants/
 * users/branches/staff_registration_tokens'ta var — rls_setup.sql'de
 * doğrulandı), o yüzden `tenantId` filtresiyle doğrudan silinebilirler.
 *
 * sync_queue (ve ondan da RESTRICT ile beslenen sync_logs) listede:
 * OcrService.confirmScan, transaction commit'inden SONRA (fire-and-forget,
 * `void enqueueSyncAfterConfirm(...)`) bir sync_queue satırı ekliyor — ilk
 * yazımda gözden kaçtı ve cleanup gerçek bir FK hatasıyla
 * (sync_queue_tenant_id_fkey) patladı. sync_logs ise SyncScheduler'ın
 * (30 saniyede bir çalışan cron job) test çalışırken/askıda kalırken bu
 * satırı işleyip bir log yazmasıyla ortaya çıktı — 120 saniyelik bir askıda
 * kalma sırasında tam olarak bu oldu ve sync_logs_queue_id_fkey'de patladı.
 * Aynı şekilde başka bir serviste fire-and-forget bir yan etki eklenirse
 * burada da unutulabilir — şüpheye düşerseniz testi çalıştırıp cleanup'ın
 * hangi FK'da patladığına bakın, hata mesajı tablo adını verir.
 *
 * Yeni bir spec dosyası burada listelenmeyen bir tabloya yazıyorsa, o tabloyu
 * da bu listeye ekleyin — aksi halde afterAll'daki temizlik FK hatasıyla
 * başarısız olur. whatsapp_message_logs/purchase_order_items, purchase_orders
 * ve stock_transfers de bu şekilde eklendi (orders/transfers e2e testleri);
 * supplier_portal_uploads/branch_supplier_portals/branch_integrations/
 * agent_setup_tokens de aynı şekilde (portal/agent-sync e2e testleri);
 * scheduled_reports de aynı şekilde (reports e2e testleri).
 *
 * password_reset_tokens ve email_verification_tokens'ın User'a Prisma
 * ilişkisi YOK — onlar user_id üzerinden elle temizlenir.
 * RLS, diğer public akışlardaki gibi is_super_admin ile bypass edilir.
 */
export async function deleteTenantByTaxNumber(
  prisma: PrismaService,
  taxNumber: string,
): Promise<void> {
  await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { taxNumber },
      select: { id: true },
    });
    if (!tenant) return;

    const tenantId = tenant.id;

    // Çocuktan ebeveyne: debt_payments → debts, stock_movements →
    // stock_levels, ocr_scans/cashier_sessions, ardından products →
    // categories, en son suppliers (branch_suppliers dahil).
    await tx.debtPayment.deleteMany({ where: { debt: { tenantId } } });
    await tx.debt.deleteMany({ where: { tenantId } });
    await tx.scheduledReport.deleteMany({ where: { tenantId } });
    await tx.whatsappMessageLog.deleteMany({ where: { tenantId } });
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { tenantId } } });
    await tx.purchaseOrder.deleteMany({ where: { tenantId } });
    await tx.stockTransfer.deleteMany({ where: { tenantId } });
    // supplier_portal_uploads.supplier_id/portal_id ON DELETE SET NULL'dır,
    // ama tenant_id/branch_id RESTRICT — tenant/branch silinmeden önce
    // temizlenmeli (portal.e2e-spec.ts, whatsapp.e2e-spec.ts).
    await tx.supplierPortalUpload.deleteMany({ where: { tenantId } });
    await tx.branchSupplierPortal.deleteMany({ where: { tenantId } });
    // branch_integrations tenant_id/branch_id RESTRICT (agent-sync.e2e-spec.ts).
    await tx.branchIntegration.deleteMany({ where: { tenantId } });
    // agent_setup_tokens'ta FK yok (migration'da tanımsız) ama hijyen için
    // yine de temizlenir.
    await tx.agentSetupToken.deleteMany({ where: { tenantId } });
    await tx.stockMovement.deleteMany({ where: { tenantId } });
    await tx.stockLevel.deleteMany({ where: { tenantId } });
    await tx.ocrScan.deleteMany({ where: { tenantId } });
    await tx.cashierSession.deleteMany({ where: { tenantId } });
    await tx.syncLog.deleteMany({ where: { tenantId } });
    await tx.syncQueue.deleteMany({ where: { tenantId } });
    await tx.priceChangeLog.deleteMany({ where: { tenantId } });
    await tx.branchSupplier.deleteMany({ where: { supplier: { tenantId } } });
    await tx.product.deleteMany({ where: { tenantId } });
    await tx.category.deleteMany({ where: { tenantId } });
    await tx.supplier.deleteMany({ where: { tenantId } });

    const users = await tx.user.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    if (userIds.length > 0) {
      await tx.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } });
    }

    await tx.tenant.delete({ where: { id: tenantId } });
  });
}

/** Bir testin oluşturduğu tüm tenant'ları temizler (afterAll için). */
export async function cleanupTenants(
  prisma: PrismaService,
  taxNumbers: string[],
): Promise<void> {
  for (const taxNumber of taxNumbers) {
    await deleteTenantByTaxNumber(prisma, taxNumber);
  }
}

/** Geçerli bir signup gövdesi — testler tek tek alan ezerek kullanır. */
export function signupPayload(overrides: Partial<Record<string, unknown>> = {}) {
  const suffix = uniqueSuffix();
  return {
    companyName: `E2E Test Ltd ${suffix}`,
    taxNumber: `E2E${suffix}`,
    businessType: 'TEK_SUBE',
    branchName: 'Merkez',
    fullName: 'E2E Test Kullanıcı',
    email: `e2e-${suffix}@example.test`,
    password: 'Test1234',
    ...overrides,
  };
}

export interface SignedUpContext {
  payload: ReturnType<typeof signupPayload>;
  accessToken: string;
  tenantId: string;
  branchId: string;
  userId: string;
}

/**
 * signupPayload() ile kaydolur ve auth header'ı için gereken bağlamı döner.
 * businessType='TEK_SUBE' → STARTER plan → tek şubeli PATRON akışları
 * (debts/ocr/geçici kasa) bu planı gerektiriyor (bkz. servislerdeki
 * assertAllowed / "planId !== 'STARTER'" kontrolleri).
 *
 * signup zaten bir accessToken döndürdüğü için ayrıca POST /auth/login
 * ÇAĞRILMIYOR — login'in 5/15dk throttle'ına gereksiz yere dokunmamak için.
 */
export async function signupAndGetContext(
  app: INestApplication,
  overrides: Partial<Record<string, unknown>> = {},
): Promise<SignedUpContext> {
  const payload = signupPayload(overrides);

  const res = await request(app.getHttpServer())
    .post('/api/v1/tenants/signup')
    .send(payload)
    .expect(201);

  const { accessToken, user } = res.body.data;

  return {
    payload,
    accessToken,
    tenantId: user.tenantId,
    branchId: user.branchId,
    userId: user.id,
  };
}

export interface RoleUserContext {
  userId: string;
  email: string;
  accessToken: string;
}

/**
 * signupAndGetContext() her zaman bir PATRON döner, ama birçok endpoint
 * (ör. orders.create, stock.recordWaste, stock.updateThreshold) yalnızca
 * SUBE_MUDURU'ya açık, ya da tam tersi bir yetkisiz-rol reddini test etmek
 * gerekiyor (ör. KASIYER sipariş onaylayamaz). staff-registration akışının
 * e-posta kodu adımlarını kurmak yerine, kullanıcı doğrudan Prisma ile
 * oluşturulur (createCategory ile aynı desen — bu tabloda da RLS yok) ve
 * token'ı AuthService.issueTokens() ile mint edilir: bu, AuthService.login'in
 * kullandığı AYNI imzalama mantığı (bkz. auth.service.ts), bu yüzden
 * JwtStrategy/RolesGuard tarafında signup/login ile üretilen token'lardan
 * ayırt edilemez — ve login'in 5/15dk throttle'ına hiç dokunmaz.
 */
export async function createRoleUser(
  app: INestApplication,
  prisma: PrismaService,
  params: {
    tenantId: string;
    branchId: string | null;
    role: UserRole;
    planId?: string | null;
  },
): Promise<RoleUserContext> {
  const suffix = uniqueSuffix();
  const email = `e2e-${params.role.toLowerCase()}-${suffix}@example.test`;
  const passwordHash = await bcrypt.hash('Test1234', 4);

  const user = await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
    return tx.user.create({
      data: {
        tenantId: params.tenantId,
        branchId: params.branchId,
        email,
        fullName: `E2E ${params.role}`,
        passwordHash,
        role: params.role,
        isActive: true,
      },
      select: { id: true, email: true },
    });
  });

  const authService = app.get(AuthService);
  const { accessToken } = await authService.issueTokens({
    id: user.id,
    email: user.email,
    tenantId: params.tenantId,
    branchId: params.branchId,
    role: params.role,
    planId: params.planId ?? null,
  });

  return { userId: user.id, email: user.email, accessToken };
}

/**
 * Category oluşturur. Bu tablo için REST endpoint'i YOK (kod tabanında hiçbir
 * controller category.create çağırmıyor — yalnızca seed/harici araçlarla
 * doldurulması bekleniyor), o yüzden ürün oluşturmak için gereken kategori
 * doğrudan Prisma ile yazılır. categories tablosunda RLS yok, ekstra bağlam
 * (SET app.tenant_id) gerekmez.
 */
export async function createCategory(
  prisma: PrismaService,
  tenantId: string,
  name: string,
) {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${uniqueSuffix()}`;
  return prisma.category.create({ data: { tenantId, name, slug } });
}

/**
 * Product.salePrice günceller. CreateProductDto bu alanı almıyor — üründe
 * satış fiyatı normalde tedarikçi portalı (OTP'li onay akışı) veya Agent
 * senkronizasyonu üzerinden set ediliyor. Testte bu ağır akışları kurmak
 * yerine, salePrice'ı doğrudan Prisma ile yazıyoruz (products tablosunda da
 * RLS yok).
 */
export async function setProductSalePrice(
  prisma: PrismaService,
  productId: string,
  salePrice: number,
) {
  return prisma.product.update({ where: { id: productId }, data: { salePrice } });
}

/**
 * Redis'te tutulan bir değeri (ör. auth.service.ts'teki 2FA kodu) doğrudan
 * okur — DB-saklı token'ları (passwordResetToken/emailVerificationToken)
 * withTenantContext ile okuyan diğer testlerle aynı gerekçe: mock e-posta
 * yalnızca loglandığı için asıl değere uygulama koduyla AYNI kaynaktan
 * (burada Redis, oradaysa DB) ulaşılması gerekiyor. Her çağrı kısa ömürlü
 * kendi bağlantısını açıp kapatır — AuthService'in kendi Redis client'ına
 * karışmaz.
 */
export async function readRedisValue(key: string): Promise<string | null> {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  try {
    return await client.get(key);
  } finally {
    await client.quit();
  }
}

/**
 * Redis'te tutulan bir anahtarı siler — TTL sonrası davranışıyla (anahtar
 * artık yok) birebir aynı sonucu deterministik şekilde tetiklemek için
 * (ör. auth-2fa.e2e-spec.ts'teki "süresi dolmuş kod" testi).
 */
export async function deleteRedisValue(key: string): Promise<void> {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  try {
    await client.del(key);
  } finally {
    await client.quit();
  }
}
