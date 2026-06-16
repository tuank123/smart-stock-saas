import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsString, IsOptional, validateSync, IsArray } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  DATABASE_URL: string = '';

  @IsString()
  JWT_SECRET: string = '';

  @IsString()
  JWT_REFRESH_SECRET: string = '';

  @IsNumber()
  @IsOptional()
  JWT_EXPIRATION: number = 900; // 15 minutes in seconds

  @IsNumber()
  @IsOptional()
  JWT_REFRESH_EXPIRATION: number = 604800; // 7 days in seconds

  @IsArray()
  @IsOptional()
  CORS_ORIGINS: any = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];

  @IsString()
  @IsOptional()
  REDIS_URL: string = 'redis://localhost:6379';

  @IsNumber()
  @IsOptional()
  BCRYPT_ROUNDS: number = 12;

  @IsNumber()
  @IsOptional()
  RATE_LIMIT_WINDOW_MS: number = 900000; // 15 minutes

  @IsNumber()
  @IsOptional()
  RATE_LIMIT_MAX_REQUESTS: number = 5;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  // Parse CORS_ORIGINS as string to array if needed
  if (typeof validatedConfig.CORS_ORIGINS === 'string') {
    validatedConfig.CORS_ORIGINS = validatedConfig.CORS_ORIGINS
      .split(',')
      .map((origin) => origin.trim());
  }

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
