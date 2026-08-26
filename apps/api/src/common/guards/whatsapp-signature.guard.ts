import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';

const SIGNATURE_PREFIX = 'sha256=';

// POST /whatsapp/webhook için Meta'nın standart HMAC-SHA256 imza doğrulaması.
// Ham (JSON.parse edilmemiş) istek gövdesi üzerinden hesaplanır — bkz.
// main.ts / test/setup.ts'teki bodyParser 'verify' callback'i (req.rawBody).
// GET /whatsapp/webhook (handshake) bu guard'ı KULLANMAZ; Meta o istekte
// imza göndermez, yalnızca hub.verify_token ile doğrular.
@Injectable()
export class WhatsappSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WhatsappSignatureGuard.name);

  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { rawBody?: Buffer }>();

    const secret = this.config.get<string>('WHATSAPP_APP_SECRET');

    // Mock/dev modda WHATSAPP_APP_SECRET tanımlı değilse doğrulama atlanır —
    // WHATSAPP_ENABLED/OTP_ENABLED/S3_ENABLED gibi diğer entegrasyon
    // toggle'larıyla aynı desen. PRODUCTION'DA BU DEĞİŞKEN MUTLAKA
    // TANIMLANMALI — tanımsız kalırsa webhook imzasız kabul eder.
    if (!secret) {
      this.logger.warn(
        '[WhatsApp Webhook] WHATSAPP_APP_SECRET tanımlı değil — imza doğrulaması ATLANDI ' +
          '(yalnızca dev/mock ortamlarda kabul edilebilir; production\'da mutlaka tanımlayın).',
      );
      return true;
    }

    const signatureHeader = request.header('x-hub-signature-256');
    if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
      throw new UnauthorizedException('X-Hub-Signature-256 header eksik veya geçersiz biçimde');
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      // Middleware sırası bozulmuş/rawBody yakalanmamış olabilir — güvenli
      // tarafta kal, imzasız hiçbir isteği kabul etme.
      this.logger.error('[WhatsApp Webhook] rawBody yakalanamadı — istek reddedildi');
      throw new UnauthorizedException('İstek doğrulanamadı');
    }

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
    const provided = safeHexDecode(signatureHeader.slice(SIGNATURE_PREFIX.length));

    if (!provided || provided.length !== expected.length || !crypto.timingSafeEqual(expected, provided)) {
      throw new UnauthorizedException('Geçersiz imza');
    }

    return true;
  }
}

// Buffer.from(str, 'hex') geçersiz hex karakterlerinde sessizce kısaltılmış
// bir buffer döner (throw etmez) — bu, farklı uzunluktaki bir buffer'ı
// timingSafeEqual'e göndermeden ÖNCE net bir null ile eleyebilmek için
// ham string'i önce regex ile doğruluyor.
function safeHexDecode(hex: string): Buffer | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  return Buffer.from(hex, 'hex');
}
