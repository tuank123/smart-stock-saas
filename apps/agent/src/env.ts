import * as path from 'path';
import * as dotenv from 'dotenv';

// apps/agent/.env — çalışma dizininden bağımsız, sabit konum.
// config.ts ve setup.ts ikisi de buradan yükler (eskiden her biri ayrı ayrı
// dotenv.config çağırıyor ve yolu tekrar hesaplıyordu).
export const ENV_PATH = path.resolve(__dirname, '..', '.env');

export function loadEnv(): void {
  dotenv.config({ path: ENV_PATH });
}

/**
 * Toplayıcı doğrulayıcı: ilk hatada durmak yerine TÜM sorunları biriktirir,
 * böylece kullanıcı .env'i tek seferde düzeltebilir.
 */
export class EnvValidator {
  private readonly errors: string[] = [];

  private raw(name: string): string {
    return (process.env[name] ?? '').trim();
  }

  private fail(name: string, problem: string): void {
    this.errors.push(`${name}: ${problem}`);
  }

  /** Zorunlu, boş olmayan string. */
  requireString(name: string): string {
    const value = this.raw(name);
    if (!value) {
      this.fail(name, 'tanımlı değil (ya da boş)');
    }
    return value;
  }

  /**
   * Zorunlu + biçim kontrolü. Bu değerleri `pnpm setup` sunucudan alıp .env'e
   * kendisi yazar; elle düzenlenip bozulmadıkları (ör. kopyalarken yarısı
   * eksik kalması) sürece biçim her zaman tutar.
   */
  requirePattern(name: string, pattern: RegExp, expected: string): string {
    const value = this.requireString(name);
    if (value && !pattern.test(value)) {
      this.fail(name, `beklenen biçimde değil (${expected})`);
    }
    return value;
  }

  /** Zorunlu, http(s) şemalı geçerli URL. */
  requireUrl(name: string, fallback?: string): string {
    const value = this.raw(name) || (fallback ?? '');
    if (!value) {
      this.fail(name, 'tanımlı değil (ya da boş)');
      return value;
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      this.fail(name, `geçerli bir URL değil: "${value}"`);
      return value;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      this.fail(name, `yalnızca http/https desteklenir (verilen: ${parsed.protocol})`);
    }
    return value;
  }

  /** Opsiyonel pozitif sayı; tanımsızsa varsayılan, tanımlıysa geçerli olmalı. */
  optionalPositiveNumber(name: string, fallback: number): number {
    const value = this.raw(name);
    if (!value) return fallback;

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      this.fail(name, `pozitif bir sayı olmalı (verilen: "${value}")`);
      return fallback;
    }
    return parsed;
  }

  /** Hata varsa hepsini yazdırıp çıkar; yoksa sessizce devam eder. */
  assertValid(hint?: string): void {
    if (this.errors.length === 0) return;

    console.error('\n❌ Agent yapılandırması geçersiz — başlatılamıyor.\n');
    console.error(`   Dosya: ${ENV_PATH}\n`);
    for (const err of this.errors) {
      console.error(`   • ${err}`);
    }
    if (hint) {
      console.error(`\n   ${hint}`);
    }
    console.error('');
    process.exit(1);
  }
}
