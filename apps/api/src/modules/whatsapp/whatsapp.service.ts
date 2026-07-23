import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

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

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

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

  // ─── INBOUND (webhook) ─────────────────────────────────────────────────────

  /**
   * Meta webhook'undan gelen mesaj payload'ını işler. Gönderen bir tedarikçiyle
   * eşleşirse, metni basit "Ürün - Fiyat" parse edip PENDING_REVIEW bir
   * SupplierPortalUpload (uploadType: WHATSAPP_PRICE_UPDATE) oluşturur.
   */
  async handleIncomingMessage(payload: unknown): Promise<void> {
    const message = extractMessage(payload);
    if (!message) {
      this.logger.log('[Webhook] Mesaj içermeyen payload (status/callback olabilir) — atlanıyor');
      return;
    }

    const from = typeof message.from === 'string' ? message.from : undefined;
    const type = typeof message.type === 'string' ? message.type : undefined;
    if (!from) {
      this.logger.warn('[Webhook] Gönderen numara yok — atlanıyor');
      return;
    }

    // Şimdilik yalnız metin mesajları. image/document sonraki adımda ele alınacak.
    if (type !== 'text') {
      this.logger.log(
        `[Webhook] '${type}' tipi mesaj (${from}) — sonraki adımda ele alınacak, şimdilik atlanıyor`,
      );
      return;
    }

    const text = typeof message.text?.body === 'string' ? message.text.body : '';
    if (!text.trim()) {
      this.logger.warn(`[Webhook] Boş metin (${from}) — atlanıyor`);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      // Tenant bağlamı yok → tüm tedarikçileri süper-admin ile ara.
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);

      const fromDigits = normalizePhone(from);
      const suppliers = await tx.supplier.findMany({
        where: { deletedAt: null },
        select: { id: true, tenantId: true, whatsappNumber: true },
      });
      const supplier = suppliers.find((s) => phonesMatch(s.whatsappNumber, fromDigits));

      if (!supplier) {
        this.logger.warn(`[Webhook] Bilinmeyen gönderen: ${from} — yok sayıldı`);
        return; // 200: Meta'ya hata döndürme
      }

      // Tedarikçinin bağlı olduğu şube (önce isPrimary, yoksa ilk eşleşen).
      const branchSupplier = await tx.branchSupplier.findFirst({
        where: { supplierId: supplier.id },
        orderBy: { isPrimary: 'desc' },
        select: { branchId: true },
      });
      if (!branchSupplier) {
        this.logger.warn(
          `[Webhook] Tedarikçi ${supplier.id} bir şubeye bağlı değil (${from}) — atlanıyor`,
        );
        return;
      }

      // Ürünleri tenant içinde çek (isim eşleştirmesi için).
      const products = await tx.product.findMany({
        where: { tenantId: supplier.tenantId, deletedAt: null },
        select: { id: true, name: true },
      });

      const parsedItems: {
        productId: string;
        productName: string;
        oldPrice: null;
        newPrice: number;
        discountPct: null;
      }[] = [];
      const unmatchedLines: string[] = [];

      for (const line of text.split('\n')) {
        const parsed = parsePriceLine(line);
        if (!parsed) continue; // ayraç/fiyat yok — satırı yok say

        const match = products.find((p) =>
          p.name.toLowerCase().includes(parsed.name.toLowerCase()),
        );
        if (match) {
          parsedItems.push({
            productId: match.id,
            productName: match.name,
            oldPrice: null,
            newPrice: parsed.price,
            discountPct: null,
          });
        } else {
          unmatchedLines.push(line.trim());
        }
      }

      if (unmatchedLines.length > 0) {
        this.logger.warn(
          `[Webhook] Eşleşmeyen satırlar (${from}): ${unmatchedLines.join(' | ')}`,
        );
      }

      await tx.supplierPortalUpload.create({
        data: {
          tenantId: supplier.tenantId,
          branchId: branchSupplier.branchId,
          supplierId: supplier.id,
          uploaderPhone: from,
          effectivePhone: from,
          uploadType: 'WHATSAPP_PRICE_UPDATE',
          status: 'PENDING_REVIEW',
          parsedItems: parsedItems as object[],
          pdfUrl: null,
          ocrStatus: null,
          // portalId / otpVerifiedAt bu akışta yok (nullable).
        },
      });

      this.logger.log(
        `[Webhook] ${supplier.id} tedarikçisinden ${parsedItems.length} eşleşen kalem kaydedildi (PENDING_REVIEW)`,
      );
    });
  }
}

// ─── Webhook helpers ─────────────────────────────────────────────────────────

interface IncomingMessage {
  from?: unknown;
  type?: unknown;
  text?: { body?: unknown };
}

/** Meta payload'ından ilk mesajı güvenli şekilde çıkarır. */
function extractMessage(payload: unknown): IncomingMessage | null {
  const p = payload as {
    entry?: { changes?: { value?: { messages?: IncomingMessage[] } }[] }[];
  };
  return p?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ?? null;
}

/** Numarayı yalnız rakamlara indirger (+, boşluk, tire vb. atılır). */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** İki numara (biri ham DB değeri) esnek karşılaştırma — normalize + son 10 hane. */
function phonesMatch(dbNumber: string, fromDigits: string): boolean {
  const dbDigits = normalizePhone(dbNumber);
  if (!dbDigits || !fromDigits) return false;
  if (dbDigits === fromDigits) return true;
  const tail = (s: string) => s.slice(-10);
  return dbDigits.length >= 10 && fromDigits.length >= 10 && tail(dbDigits) === tail(fromDigits);
}

/** "Ürün Adı - 12,50 TL" / "Ürün: 12.50" → { name, price } | null. */
function parsePriceLine(line: string): { name: string; price: number } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(.+?)\s*[-:]\s*(.+)$/);
  if (!m) return null;
  const name = m[1].trim();
  const price = parsePrice(m[2]);
  if (!name || price == null) return null;
  return { name, price };
}

/** Fiyat metnini sayıya çevirir: "TL"/"₺"/boşluk temizlenir, TR ondalık desteği. */
function parsePrice(raw: string): number | null {
  let s = raw.replace(/tl|₺/gi, '').replace(/\s/g, '');
  if (s.includes('.') && s.includes(',')) {
    // "1.234,56" → binlik '.', ondalık ','
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    // "12,50" → ondalık ','
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
