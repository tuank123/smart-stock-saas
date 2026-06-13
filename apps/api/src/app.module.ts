import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { BranchesModule } from './modules/branches/branches.module';
import { StaffRegistrationModule } from './modules/staff-registration/staff-registration.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenantGuard } from './common/guards/tenant.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    // ============================================
    // CONFIGURATION
    // ============================================
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),

    // ============================================
    // DATABASE
    // ============================================
    PrismaModule,

    // ============================================
    // FEATURE MODULES
    // ============================================
    AuthModule,
    UsersModule,
    TenantsModule,
    BranchesModule,
    StaffRegistrationModule,
  ],

  // ============================================
  // GLOBAL PROVIDERS
  // ============================================
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector, jwtService: JwtService, configService: ConfigService) => 
        new JwtAuthGuard(reflector, jwtService, configService),
      inject: [Reflector, JwtService, ConfigService],
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {
  constructor(private configService: ConfigService) {
    this.logConfiguration();
  }

  private logConfiguration() {
    const nodeEnv = this.configService.get('NODE_ENV', 'development');
    const dbUrl = this.configService.get('DATABASE_URL', '').split('@')[1] || 'not-set';

    console.log(`\n✅ App Module Initialized`);
    console.log(`   NODE_ENV: ${nodeEnv}`);
    console.log(`   Database: ${dbUrl}\n`);
  }
}
