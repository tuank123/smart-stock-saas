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
 * users/branches FK'de onDelete: Cascade tanımlı, ama password_reset_tokens ve
 * email_verification_tokens tablolarının User'a Prisma ilişkisi YOK — bu yüzden
 * onları önce user_id üzerinden elle temizliyoruz, yoksa öksüz kayıt kalır.
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

    const users = await tx.user.findMany({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    if (userIds.length > 0) {
      await tx.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
      await tx.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } });
    }

    await tx.tenant.delete({ where: { id: tenant.id } });
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
