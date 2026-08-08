import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private config: ConfigService) {}

  /**
   * E-posta gönderir. EMAIL_ENABLED !== 'true' iken mock modda çalışır
   * (sadece loglar). SmsService'teki mock deseniyle tutarlı.
   */
  async sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<{ success: boolean }> {
    const enabled = this.config.get<string>('EMAIL_ENABLED') === 'true';

    if (!enabled) {
      this.logger.log(`[MOCK EMAIL] To: ${to} | Subject: ${subject}\n${body}`);
      return { success: true };
    }

    // TODO: gerçek e-posta sağlayıcısı (SendGrid/SES) buraya bağlanacak.
    throw new Error('Email provider not implemented');
  }
}
