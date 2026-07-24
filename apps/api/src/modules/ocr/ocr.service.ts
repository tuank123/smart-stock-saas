import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { ConfirmScanDto, ScanDto } from './dto/ocr.dto';

export interface RawOcrLine {
  name: string;
  qty: number;
  unit: string;
  confidence: number;
}

export interface ParsedLine extends RawOcrLine {
  matchStatus: 'AUTO_MATCHED' | 'UNMATCHED';
  matchedProductId?: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
}

const MOCK_RAW: RawOcrLine[] = [
  { name: 'Coca-Cola 33cl', qty: 24, unit: 'adet', confidence: 0.95 },
  { name: 'Su 0.5L',        qty: 48, unit: 'adet', confidence: 0.92 },
  { name: 'Bilinmeyen Ürün XYZ', qty: 12, unit: 'adet', confidence: 0.45 },
];

const AUTO_MATCH_THRESHOLD = 0.85;

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private sync: SyncService,
  ) {}

  async scan(
    dto: ScanDto,
    user: { tenantId: string; userId: string },
  ) {
    const enabled = this.config.get<string>('OCR_ENABLED') === 'true';

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      // Create PENDING scan record
      const scan = await tx.ocrScan.create({
        data: {
          tenantId: user.tenantId,
          branchId: dto.branchId,
          scannedBy: user.userId,
          imageUrl: dto.imageBase64 ? `data:image/jpeg;base64,...` : 'mock://no-image',
          status: 'PROCESSING',
        },
      });

      // Run OCR (mock or real)
      let rawLines: RawOcrLine[];
      let rawOcrResult: object;

      if (!enabled) {
        this.logger.log(`📄 [MOCK] OCR tarama — scanId=${scan.id}`);
        rawLines = MOCK_RAW;
        rawOcrResult = { source: 'mock', lines: MOCK_RAW };
      } else {
        const result = await this.callTextract(dto.imageBase64 ?? '');
        rawLines = result.lines;
        rawOcrResult = result.raw;
      }

      // Load tenant products for fuzzy matching
      const products = await tx.product.findMany({
        where: { tenantId: user.tenantId, isActive: true },
        select: { id: true, name: true, sku: true },
      });

      const parsedLines = this.fuzzyMatch(rawLines, products);

      await tx.ocrScan.update({
        where: { id: scan.id },
        data: {
          rawOcrResult,
          parsedLines: parsedLines as object[],
          status: 'PROCESSED',
        },
      });

      return {
        scanId: scan.id,
        parsedLines,
      };
    });
  }

  async confirmScan(
    scanId: string,
    dto: ConfirmScanDto,
    user: { tenantId: string; userId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const scan = await tx.ocrScan.findUnique({
        where: { id: scanId },
        select: { id: true, tenantId: true, status: true, branchId: true },
      });

      if (!scan || scan.tenantId !== user.tenantId) {
        throw new NotFoundException('Tarama bulunamadı');
      }
      if (scan.status !== 'PROCESSED') {
        throw new BadRequestException(
          `Yalnızca PROCESSED taramalar onaylanabilir (mevcut: ${scan.status})`,
        );
      }

      const stockUpdates: { productId: string; newQuantity: string }[] = [];

      for (const line of dto.lines) {
        // Optimistic lock: version+1 with increment
        await tx.stockLevel.updateMany({
          where: { productId: line.productId, branchId: scan.branchId },
          data: {
            quantity: { increment: line.qty },
            version: { increment: 1 },
          },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: user.tenantId,
            productId: line.productId,
            branchId: scan.branchId,
            movementType: 'OCR_IMPORT',
            quantity: line.qty,
            referenceId: scan.id,
            referenceType: 'OCR_SCAN',
            createdBy: user.userId,
          },
        });

        // Read updated qty
        const updated = await tx.stockLevel.findFirst({
          where: { productId: line.productId, branchId: scan.branchId },
          select: { quantity: true },
        });

        if (updated) {
          stockUpdates.push({
            productId: line.productId,
            newQuantity: updated.quantity.toString(),
          });
        }
      }

      await tx.ocrScan.update({
        where: { id: scanId },
        data: {
          status: 'CONFIRMED',
          confirmedBy: user.userId,
          confirmedAt: new Date(),
        },
      });

      const result = {
        confirmedCount: dto.lines.length,
        stockUpdates,
      };

      // Enqueue sync after transaction commits (fire-and-forget)
      void this.enqueueSyncAfterConfirm(scan.branchId, user, dto.lines, scanId);

      return result;
    });
  }

  async listScans(branchId: string, user: { tenantId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      return tx.ocrScan.findMany({
        where: { tenantId: user.tenantId, branchId },
        select: {
          id: true,
          status: true,
          imageUrl: true,
          parsedLines: true,
          createdAt: true,
          confirmedAt: true,
          scanner: { select: { id: true, email: true } },
          confirmer: { select: { id: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  /**
   * Ham OCR satırlarını döndürür — hiçbir DB işlemi/transaction yok.
   * WhatsApp görsel/PDF akışı gibi harici modüller yalnız satır çıkarımı için
   * bunu kullanabilir (mock modda her zaman MOCK_RAW döner).
   */
  async extractRawLines(imageBase64: string): Promise<RawOcrLine[]> {
    const result = await this.callTextract(imageBase64);
    return result.lines;
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private async enqueueSyncAfterConfirm(
    branchId: string,
    user: { tenantId: string; userId: string },
    lines: { productId: string; qty: number; unit: string }[],
    scanId: string,
  ) {
    try {
      const integration = await this.prisma.branchIntegration.findUnique({
        where: { branchId },
        select: { adapterType: true },
      });
      const adapterType = integration?.adapterType ?? 'UNKNOWN';

      for (const line of lines) {
        await this.sync.addToQueue({
          tenantId:      user.tenantId,
          branchId,
          operationType: 'PRICE_UPDATE',
          payload:       { scanId, productId: line.productId, qty: line.qty, unit: line.unit },
          adapterType,
          createdBy:     user.userId,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Sync] OCR enqueue hatası: ${msg}`);
    }
  }

  private fuzzyMatch(rawLines: RawOcrLine[], products: Product[]): ParsedLine[] {
    return rawLines.map((line) => {
      if (line.confidence < AUTO_MATCH_THRESHOLD) {
        return { ...line, matchStatus: 'UNMATCHED' as const };
      }

      const nameLower = line.name.toLowerCase();
      const match = products.find((p) => {
        const pName = p.name.toLowerCase();
        const pSku  = p.sku.toLowerCase();
        return (
          pName.includes(nameLower) ||
          nameLower.includes(pName) ||
          pSku === nameLower ||
          // word overlap: at least one meaningful token matches
          nameLower.split(/\s+/).some(
            (tok) => tok.length > 1 && pName.includes(tok),
          )
        );
      });

      if (match) {
        return {
          ...line,
          matchStatus: 'AUTO_MATCHED' as const,
          matchedProductId: match.id,
        };
      }

      return { ...line, matchStatus: 'UNMATCHED' as const };
    });
  }

  private async callTextract(
    imageBase64: string,
  ): Promise<{ lines: RawOcrLine[]; raw: object }> {
    // Real AWS Textract integration placeholder
    // In production: use @aws-sdk/client-textract
    const region   = this.config.get<string>('AWS_REGION', 'eu-central-1');
    const bucket   = this.config.get<string>('AWS_S3_BUCKET', 'stokpilot-media');
    this.logger.log(`[Textract] region=${region} bucket=${bucket} (not implemented)`);
    void imageBase64;
    return { lines: MOCK_RAW, raw: { source: 'textract-stub' } };
  }
}
