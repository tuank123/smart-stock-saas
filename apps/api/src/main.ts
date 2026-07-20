import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);

  // ============================================
  // MIDDLEWARE
  // ============================================
  app.use(cookieParser());

  // ============================================
  // SECURITY
  // ============================================
  app.use(
    helmet({
      // Relax CSP for Swagger UI in non-production
      contentSecurityPolicy: configService.get('NODE_ENV') === 'production',
    }),
  );

  // ============================================
  // CORS
  // ============================================
  app.enableCors({
    origin: (origin, callback) => {
      const allowed = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://192.168.1.165:3001',
        'capacitor://localhost',
        'ionic://localhost',
        'http://localhost',
      ];
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // dev'de hepsine izin ver
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Platform'],
  });

  // ============================================
  // API PREFIX & VERSIONING
  // ============================================
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // ============================================
  // BODY SIZE LIMIT
  // ============================================
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // ============================================
  // GLOBAL PIPES
  // ============================================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ============================================
  // SWAGGER / OPENAPI
  // ============================================
  if (configService.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('StokPilot API')
      .setDescription('Multi-tenant SaaS Inventory Management API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addTag('auth', 'Authentication & JWT')
      .addTag('branches', 'Branch management')
      .addTag('products', 'Product catalogue')
      .addTag('stock', 'Stock levels & movements')
      .addTag('orders', 'Purchase orders')
      .addTag('suppliers', 'Supplier management')
      .addTag('transfers', 'Inter-branch transfers')
      .addTag('sync', 'ERP/POS sync queue')
      .addTag('ocr', 'OCR invoice scanning')
      .addTag('portal', 'Supplier portal')
      .addTag('reports', 'Scheduled reports & anomalies')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // ============================================
  // GRACEFUL SHUTDOWN
  // ============================================
  process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing HTTP server');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT signal received: closing HTTP server');
    await app.close();
    process.exit(0);
  });

  // ============================================
  // START SERVER
  // ============================================
  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  await app.listen(port, () => {
    console.log(`\n🚀 StokPilot API started on http://localhost:${port}/api/v1`);
    console.log(`📝 Environment: ${nodeEnv}`);
    console.log(`💾 Database: ${configService.get('DATABASE_URL')?.split('@')[1]}`);
    if (nodeEnv !== 'production') {
      console.log(`📚 Swagger UI: http://localhost:${port}/api/docs\n`);
    }
  });
}

bootstrap().catch((error) => {
  console.error('❌ Bootstrap error:', error);
  process.exit(1);
});
