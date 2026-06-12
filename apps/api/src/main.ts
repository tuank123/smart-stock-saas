import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
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
  app.use(helmet());

  // ============================================
  // CORS
  // ============================================
  app.enableCors({
    origin: configService.get<string[]>('CORS_ORIGINS', ['http://localhost:3000', 'http://localhost:3001']),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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
    console.log(`💾 Database: ${configService.get('DATABASE_URL')?.split('@')[1]}\n`);
  });
}

bootstrap().catch((error) => {
  console.error('❌ Bootstrap error:', error);
  process.exit(1);
});
