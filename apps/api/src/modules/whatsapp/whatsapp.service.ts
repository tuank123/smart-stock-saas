import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WhatsappSendParams {
  poId: string;
  supplierPhone: string;
  supplierName: string;
  branchName: string;
  items: { name: string; quantity: string | number; unit: string }[];
  notes?: string | null;
}

export interface WhatsappSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  messageBody: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private config: ConfigService) {}

  buildMessage(
    params: Pick<WhatsappSendParams, 'supplierName' | 'branchName' | 'items' | 'notes'>,
  ): string {
    const lines = params.items
      .map((i) => `- ${i.name}: ${i.quantity} ${i.unit}`)
      .join('\n');
    // Mevcut şablon aynen korunur; kullanıcı notu (varsa) mesajın sonuna eklenir.
    const base =
      `Merhaba ${params.supplierName}, ${params.branchName} şubemizden sipariş:\n` +
      `${lines}\n` +
      `Toplam ${params.items.length} kalem. Teşekkürler, StokPilot`;
    const note = params.notes?.trim();
    return note ? `${base}\n\nNot: ${note}` : base;
  }

  async sendOrderMessage(params: WhatsappSendParams): Promise<WhatsappSendResult> {
    const messageBody = this.buildMessage(params);
    const enabled = this.config.get<string>('WHATSAPP_ENABLED') === 'true';

    if (!enabled) {
      this.logger.log(`📱 [MOCK] WhatsApp gönderildi: ${params.supplierPhone}\n${messageBody}`);
      return { success: true, messageId: `mock-${Date.now()}`, messageBody };
    }

    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const apiUrl = this.config.get<string>('WHATSAPP_API_URL', 'https://graph.facebook.com/v18.0');

    try {
      const res = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: params.supplierPhone,
          type: 'text',
          text: { body: messageBody },
        }),
      });

      const data = (await res.json()) as {
        messages?: { id: string }[];
        error?: { message: string };
      };

      if (res.ok && data.messages?.[0]?.id) {
        return { success: true, messageId: data.messages[0].id, messageBody };
      }
      return { success: false, error: data.error?.message ?? 'Unknown error', messageBody };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg, messageBody };
    }
  }
}
