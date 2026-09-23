import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  validateSync,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsUrl,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

// Entegrasyon bayrakları kodda her yerde `=== 'true'` ile okunuyor. Bu yüzden
// `True`, `1`, `yes` gibi bir değer bayrağı SESSİZCE kapalı bırakır — bu
// listeyle böyle bir yazım hatası boot'ta yakalanır.
const BOOLEAN_FLAG = ['true', 'false'];

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

  // ── Uygulama katmanı şifreleme ──────────────────────────────
  // AES-256-GCM anahtarı (common/utils/encryption.ts). Eskiden yalnızca İLK
  // KULLANIMDA (bir telefon şifrelenirken) kontrol ediliyordu; yani anahtarsız
  // ya da bozuk anahtarlı bir sunucu sorunsuz açılıp ancak kullanıcı bir kayıt
  // oluşturduğunda patlıyordu. Boot'ta doğrulanması gerekir.
  // Format encryption.ts:9 ile birebir aynı: 64 karakter hex (32 byte).
  @IsString()
  @Matches(/^[0-9a-fA-F]{64}$/, {
    message: 'ENCRYPTION_KEY 64 karakterlik hex string olmalı (openssl rand -hex 32)',
  })
  ENCRYPTION_KEY!: string;

  // ── Entegrasyon bayrakları ──────────────────────────────────
  // Tanımsız = kapalı (güvenli varsayılan) — bu yüzden zorunlu DEĞİL; ama
  // tanımlıysa yazımı doğru olmalı (bkz. BOOLEAN_FLAG).
  @IsIn(BOOLEAN_FLAG)
  @IsOptional()
  EMAIL_ENABLED?: string;

  @IsIn(BOOLEAN_FLAG)
  @IsOptional()
  SMS_ENABLED?: string;

  @IsIn(BOOLEAN_FLAG)
  @IsOptional()
  OCR_ENABLED?: string;

  @IsIn(BOOLEAN_FLAG)
  @IsOptional()
  SYNC_ENABLED?: string;

  @IsIn(BOOLEAN_FLAG)
  @IsOptional()
  OTP_ENABLED?: string;

  @IsIn(BOOLEAN_FLAG)
  @IsOptional()
  S3_ENABLED?: string;

  @IsIn(BOOLEAN_FLAG)
  @IsOptional()
  WHATSAPP_ENABLED?: string;

  // ── WhatsApp ────────────────────────────────────────────────
  // Webhook imza doğrulaması (common/guards/whatsapp-signature.guard.ts:39)
  // bu değişken TANIMSIZSA doğrulamayı tamamen ATLAR ve imzasız isteği kabul
  // eder — dev'de kasıtlı, production'da açık bir güvenlik deliği. Bayrağa
  // değil NODE_ENV'e bağlandı: webhook route'u WHATSAPP_ENABLED'dan bağımsız
  // olarak ayakta, dolayısıyla production'da her hâlükârda zorunlu.
  @ValidateIf((o: EnvironmentVariables) => o.NODE_ENV === Environment.Production)
  @IsString()
  @IsNotEmpty({
    message:
      'WHATSAPP_APP_SECRET production ortamında zorunludur — tanımsızsa webhook imza doğrulaması atlanır',
  })
  WHATSAPP_APP_SECRET?: string;

  // Aşağıdakiler yalnızca entegrasyon AÇIKKEN anlamlı. Bayrak açıkken eksik
  // olurlarsa istek Meta'ya hiç gitmez / webhook doğrulaması 403 döner — yani
  // entegrasyon sessizce çalışmaz görünür. Bayrak kapalıyken kısıt yok.
  @ValidateIf((o: EnvironmentVariables) => o.WHATSAPP_ENABLED === 'true')
  @IsString()
  @IsNotEmpty()
  WHATSAPP_ACCESS_TOKEN?: string;

  @ValidateIf((o: EnvironmentVariables) => o.WHATSAPP_ENABLED === 'true')
  @IsString()
  @IsNotEmpty()
  WHATSAPP_PHONE_NUMBER_ID?: string;

  @ValidateIf((o: EnvironmentVariables) => o.WHATSAPP_ENABLED === 'true')
  @IsString()
  @IsNotEmpty()
  WHATSAPP_WEBHOOK_VERIFY_TOKEN?: string;

  // ── Uygulama adresi ─────────────────────────────────────────
  // Parola sıfırlama bağlantılarına gömülür (auth.service.ts:744). Kod
  // tarafında varsayılanı var, o yüzden zorunlu değil; ama bozuk bir değer
  // kullanıcıya açılmayan bir link göndereceği için biçimi doğrulanıyor.
  // require_tld: false     → 'http://localhost:3001' geçerli sayılsın.
  // require_protocol: true → şemasız 'http//bad' gibi bir değer, validator.js
  //                          tarafından "host=http, path=/bad" diye geçerli
  //                          sayılıyordu; şema zorunlu olunca yakalanıyor.
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  @IsOptional()
  APP_URL?: string;
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
