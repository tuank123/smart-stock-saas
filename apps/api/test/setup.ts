/**
 * e2e test yardımcıları.
 *
 * createTestApp(), main.ts'teki bootstrap yapılandırmasının AYNISINI uygular
 * (cookie-parser, CORS, global prefix + versioning, ValidationPipe). Aksi
 * halde testler gerçek uygulamadan farklı bir pipeline'ı test etmiş olurdu:
 * doğrulama hataları 400 yerine 201 dönerdi ve rotalar /api/v1 önekini almazdı.
 *
 * Global guard'lar (Throttler, JWT, Tenant, Roles) ve exception filter'ı
 * AppModule'de APP_GUARD/APP_FILTER ile tanımlı olduğu için otomatik gelir.
 */
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

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

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  app.use(cookieParser());

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
 * Yeni bir spec dosyası burada listelenmeyen bir tabloya (ör. purchase_orders,
 * stock_transfers) yazıyorsa, o tabloyu da bu listeye ekleyin — aksi halde
 * afterAll'daki temizlik FK hatasıyla başarısız olur.
 *
 * password_reset_tokens ve email_verification_tokens'ın User'a Prisma
 * ilişkisi YOK — onlar user_id üzerinden elle temizlenir.
 * RLS, diğer public akışlardaki gibi is_super_admin ile bypass edilir.
 */
export async function deleteTenantByTaxNumber(
  prisma: PrismaService,
  taxNumber: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);

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
