import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private config: ConfigService) {}

  /**
   * SMS gönderir. SMS_ENABLED !== 'true' iken mock modda çalışır (sadece loglar).
   * WhatsappService'teki mock deseniyle tutarlı.
   */
  async sendSms(
    phone: string,
    message: string,
  ): Promise<{ success: boolean; messageId?: string }> {
    const enabled = this.config.get<string>('SMS_ENABLED') === 'true';

    if (!enabled) {
      this.logger.log(`[SMS-MOCK] To: ${phone} | Message: ${message}`);
      return { success: true, messageId: 'mock-sms-' + Date.now() };
    }

    // TODO: Gerçek SMS sağlayıcı entegrasyonu (ör. Netgsm / İleti Merkezi / Twilio).
    // Bugün gerçek bir API'ye bağlanmıyoruz — şimdilik mock davranışını koruyoruz.
    this.logger.log(`[SMS-MOCK(enabled)] To: ${phone} | Message: ${message}`);
    return { success: true, messageId: 'mock-sms-' + Date.now() };
  }
}
