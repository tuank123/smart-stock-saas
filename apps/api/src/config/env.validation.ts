import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  validateSync,
  IsArray,
  IsNotEmpty,
  MinLength,
} from 'class-validator';

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

  // Varsayılan YOK: boş string varsayılanı @IsString()'i geçtiği için,
  // DATABASE_URL hiç tanımlanmasa bile uygulama açılıyor ve hata ancak çok
  // sonra, bağlantı anında kafa karıştırıcı bir mesajla ortaya çıkıyordu.
  // Sırlardaki gibi bir MinLength anlamlı değil (bağlantı dizgisi) — burada
  // yalnızca "zorunlu ve boş olmayan" yeterli.
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // Varsayılan YOK ve en az 32 karakter: eksik ya da zayıf bir imza anahtarıyla
  // uygulama sessizce açılmamalı. Boş string varsayılanı (`= ''`) @IsString()
  // kontrolünü geçtiği için, JWT_SECRET hiç tanımlanmasa bile uygulama boş
  // anahtarla ayağa kalkıyordu. `!` ile tanımsızsa validateSync
  // (skipMissingProperties:false) boot sırasında hata fırlatır.
  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  // Tedarikçi portalı oturum token'ını imzalar (portal.service.ts:196,205).
  // Uygulamada KULLANILIYORDU ama burada hiç tanımlı değildi — yani hiçbir
  // doğrulamadan geçmiyordu. Diğer iki imza anahtarıyla aynı kural.
  @IsString()
  @MinLength(32)
  PORTAL_JWT_SECRET!: string;

  @IsNumber()
  @IsOptional()
  JWT_EXPIRATION: number = 900; // 15 minutes in seconds

  @IsNumber()
  @IsOptional()
  JWT_REFRESH_EXPIRATION: number = 604800; // 7 days in seconds

  @IsArray()
  @IsOptional()
  ALLOWED_ORIGINS: any = ['http://localhost:3001', 'capacitor://localhost', 'http://localhost'];

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

  // Parse ALLOWED_ORIGINS as string to array if needed
  if (typeof validatedConfig.ALLOWED_ORIGINS === 'string') {
    validatedConfig.ALLOWED_ORIGINS = validatedConfig.ALLOWED_ORIGINS
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
