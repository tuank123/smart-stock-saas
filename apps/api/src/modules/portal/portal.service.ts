import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createClient, RedisClientType } from 'redis';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdatePriceItemsDto, UploadDto } from './dto/portal.dto';

const MOCK_OTP = '123456';
const OTP_TTL_SECONDS = 300;

@Injectable()
export class PortalService implements OnModuleInit {
  private readonly logger = new Logger(PortalService.name);
  private redis: RedisClientType | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private jwtService: JwtService,
  ) {}

  async onModuleInit() {
    try {
      this.redis = createClient({ url: this.config.get('REDIS_URL') });
      await this.redis.connect();
      this.logger.log('✅ Redis connected (portal OTP)');
    } catch {
      this.logger.warn('⚠️  Redis bağlanamadı — OTP mock modda çalışacak');
    }
  }

  // ─── PORTAL ──────────────────────────────────────────────────────────────

  async createPortal(branchId: string, tenantId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const branch = await tx.branch.findUnique({
        where: { id: branchId },
        select: { id: true, tenantId: true, slug: true },
      });
      if (!branch || branch.tenantId !== tenantId) {
        throw new NotFoundException('Şube bulunamadı');
      }

      const existing = await tx.branchSupplierPortal.findUnique({
        where: { branchId },
      });
      if (existing) {
        throw new ConflictException('Bu şube için zaten bir portal mevcut');
      }

      const subdomain = branch.slug;
      return tx.branchSupplierPortal.create({
        data: { tenantId, branchId, subdomain },
      });
    });
  }

  async getPortalBySubdomain(subdomain: string) {
    // Public — no RLS context needed (subdomain is a global unique lookup)
    const portal = await this.prisma.branchSupplierPortal.findUnique({
      where: { subdomain },
      include: { branch: { select: { name: true } } },
    });
    if (!portal || !portal.isActive) {
      throw new NotFoundException('Portal bulunamadı veya aktif değil');
    }
    return portal;
  }

  // ─── OTP ─────────────────────────────────────────────────────────────────

  async sendOtp(phone: string, portalId: string): Promise<void> {
    const enabled = this.config.get('OTP_ENABLED') === 'true';
    const key = `otp:${portalId}:${phone}`;

    if (!enabled) {
      this.logger.log(`📱 [MOCK] OTP: ${MOCK_OTP} → ${phone}`);
      if (this.redis) {
        await this.redis.set(key, MOCK_OTP, { EX: OTP_TTL_SECONDS });
      }
      return;
    }

    // Real path (WhatsApp OTP) — store generated OTP in Redis
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    if (this.redis) {
      await this.redis.set(key, code, { EX: OTP_TTL_SECONDS });
    }
    this.logger.log(`📱 [REAL] OTP ${code} → ${phone}`);
  }

  async verifyOtp(phone: string, otp: string, portalId: string): Promise<boolean> {
    const enabled = this.config.get('OTP_ENABLED') === 'true';

    if (!enabled) {
      return otp === MOCK_OTP;
    }

    const key = `otp:${portalId}:${phone}`;
    if (!this.redis) return otp === MOCK_OTP;

    const stored = await this.redis.get(key);
    if (stored !== otp) return false;

    await this.redis.del(key);
    return true;
  }

  issueSessionToken(phone: string, portalId: string): string {
    return this.jwtService.sign(
      { phone, portalId, purpose: 'portal_upload' },
      {
        secret: this.config.get('PORTAL_JWT_SECRET'),
        expiresIn: '30m',
      },
    );
  }

  verifySessionToken(token: string): { phone: string; portalId: string } {
    try {
      return this.jwtService.verify(token, {
        secret: this.config.get('PORTAL_JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş session token');
    }
  }

  // ─── UPLOAD ──────────────────────────────────────────────────────────────

  async uploadPdf(subdomain: string, dto: UploadDto) {
    const portal = await this.getPortalBySubdomain(subdomain);

    const session = this.verifySessionToken(dto.sessionToken);
    if (session.phone !== dto.phone || session.portalId !== portal.id) {
      throw new UnauthorizedException('Session token bu portal veya telefon için geçerli değil');
    }

    const s3Enabled = this.config.get('S3_ENABLED') === 'true';
    const ocrEnabled = this.config.get('OCR_ENABLED') === 'true';

    const pdfUrl = s3Enabled
      ? `s3://stokpilot-uploads/${portal.id}/${Date.now()}.pdf`
      : `mock-s3/${portal.id}-${Date.now()}.pdf`;

    const ocrExtractedFirm = ocrEnabled ? null : 'Mock Firma A.Ş.';
    const ocrExtractedPhone = ocrEnabled ? null : dto.phone;
    const uploadType = dto.supplierId ? 'PRICE_UPDATE' : 'NEW_SUPPLIER';

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${portal.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      return tx.supplierPortalUpload.create({
        data: {
          tenantId: portal.tenantId,
          branchId: portal.branchId,
          portalId: portal.id,
          supplierId: dto.supplierId ?? null,
          uploaderPhone: dto.phone,
          otpVerifiedAt: new Date(),
          pdfUrl,
          ocrExtractedFirm,
          ocrExtractedPhone,
          effectivePhone: dto.phone,
          ocrStatus: ocrEnabled ? 'PENDING' : 'MOCK',
          uploadType,
          status: 'PENDING_REVIEW',
        },
      });
    });
  }

  // ─── REVIEW ──────────────────────────────────────────────────────────────

  async listUploads(
    branchId: string,
    tenantId: string,
    role?: string | null,
    planId?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      if (role === 'PATRON' && planId !== 'STARTER') {
        throw new ForbiddenException(
          'Bu işlem yalnızca şube müdürleri veya tek şubeli işletme sahipleri tarafından yapılabilir',
        );
      }

      return tx.supplierPortalUpload.findMany({
        where: { branchId, tenantId, status: 'PENDING_REVIEW' },
        include: {
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async approveUpload(
    uploadId: string,
    reviewerId: string,
    tenantId: string,
    role?: string | null,
    planId?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      if (role === 'PATRON' && planId !== 'STARTER') {
        throw new ForbiddenException(
          'Bu işlem yalnızca şube müdürleri veya tek şubeli işletme sahipleri tarafından yapılabilir',
        );
      }

      const upload = await tx.supplierPortalUpload.findUnique({ where: { id: uploadId } });
      if (!upload || upload.tenantId !== tenantId) {
        throw new NotFoundException('Yükleme bulunamadı');
      }

      // Auto-create supplier for NEW_SUPPLIER uploads
      let supplierId = upload.supplierId;
      if (upload.uploadType === 'NEW_SUPPLIER' && !supplierId) {
        const firmName = upload.ocrExtractedFirm ?? `Tedarikçi ${upload.uploaderPhone}`;
        const newSupplier = await tx.supplier.create({
          data: {
            tenantId,
            name: firmName,
            whatsappNumber: upload.effectivePhone,
            otpVerified: true,
            otpVerifiedAt: upload.otpVerifiedAt,
          },
        });
        supplierId = newSupplier.id;
      }

      // Onay = fiyatları GERÇEKTEN uygula: her kalem için Product.salePrice güncelle
      // ve PriceChangeLog kaydı oluştur.
      const items = Array.isArray(upload.parsedItems)
        ? (upload.parsedItems as unknown as ParsedItem[])
        : [];

      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true, tenantId: true, salePrice: true },
        });
        // Başka tenant'a ait veya bulunamayan ürünleri atla (güvenlik).
        if (!product || product.tenantId !== tenantId) continue;

        // İndirim uygulanmış nihai fiyat (2 ondalık).
        const discount = item.discountPct ?? 0;
        const finalPrice = round2(item.newPrice * (1 - discount / 100));

        // Eski fiyat = DB'deki mevcut salePrice (güvenilir kaynak); yoksa null.
        const oldPrice = product.salePrice != null ? Number(product.salePrice) : null;

        // Değişim yüzdesi + anomali. İlk fiyat atamasında (oldPrice yok/0) değişim 0,
        // anomali sayılmaz.
        let changePct = 0;
        let anomalyFlag = false;
        if (oldPrice != null && oldPrice !== 0) {
          changePct = clampPct(round2(((finalPrice - oldPrice) / oldPrice) * 100));
          anomalyFlag = Math.abs(changePct) > PRICE_ANOMALY_PCT;
        }

        await tx.product.update({
          where: { id: product.id },
          data: { salePrice: finalPrice },
        });

        await tx.priceChangeLog.create({
          data: {
            tenantId,
            productId: product.id,
            branchId: upload.branchId,
            oldPrice: oldPrice ?? 0, // PriceChangeLog.oldPrice zorunlu; ilk atamada 0
            newPrice: finalPrice,
            changePct,
            anomalyFlag,
            changedBy: reviewerId,
          },
        });
      }

      return tx.supplierPortalUpload.update({
        where: { id: uploadId },
        data: {
          status: 'APPROVED',
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          supplierId,
        },
      });
    });
  }

  async rejectUpload(
    uploadId: string,
    reviewerId: string,
    tenantId: string,
    role?: string | null,
    planId?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      if (role === 'PATRON' && planId !== 'STARTER') {
        throw new ForbiddenException(
          'Bu işlem yalnızca şube müdürleri veya tek şubeli işletme sahipleri tarafından yapılabilir',
        );
      }

      const upload = await tx.supplierPortalUpload.findUnique({ where: { id: uploadId } });
      if (!upload || upload.tenantId !== tenantId) {
        throw new NotFoundException('Yükleme bulunamadı');
      }

      return tx.supplierPortalUpload.update({
        where: { id: uploadId },
        data: { status: 'REJECTED', reviewedBy: reviewerId, reviewedAt: new Date() },
      });
    });
  }

  async getUploadDetail(
    uploadId: string,
    tenantId: string,
    role?: string | null,
    planId?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      if (role === 'PATRON' && planId !== 'STARTER') {
        throw new ForbiddenException(
          'Bu işlem yalnızca şube müdürleri veya tek şubeli işletme sahipleri tarafından yapılabilir',
        );
      }

      const upload = await tx.supplierPortalUpload.findUnique({
        where: { id: uploadId },
        include: { supplier: { select: { id: true, name: true } } },
      });

      if (!upload || upload.tenantId !== tenantId) {
        throw new NotFoundException('Yükleme bulunamadı');
      }

      return upload;
    });
  }

  async updateUploadItems(
    uploadId: string,
    dto: UpdatePriceItemsDto,
    tenantId: string,
    role?: string | null,
    planId?: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
      if (role === 'PATRON' && planId !== 'STARTER') {
        throw new ForbiddenException(
          'Bu işlem yalnızca şube müdürleri veya tek şubeli işletme sahipleri tarafından yapılabilir',
        );
      }

      const upload = await tx.supplierPortalUpload.findUnique({ where: { id: uploadId } });
      if (!upload || upload.tenantId !== tenantId) {
        throw new NotFoundException('Yükleme bulunamadı');
      }

      const existingItems = Array.isArray(upload.parsedItems)
        ? (upload.parsedItems as unknown as ParsedItem[])
        : [];

      const products = await tx.product.findMany({
        where: { id: { in: dto.items.map((i) => i.productId) } },
        select: { id: true, name: true },
      });
      const productNames = new Map(products.map((p) => [p.id, p.name]));

      const updatedItems: ParsedItem[] = dto.items.map((item) => {
        const existing = existingItems.find((e) => e.productId === item.productId);
        return {
          productId: item.productId,
          productName: existing?.productName ?? productNames.get(item.productId) ?? '',
          oldPrice: existing?.oldPrice ?? null,
          newPrice: item.newPrice,
          discountPct: item.discountPct ?? existing?.discountPct ?? null,
        };
      });

      const mergedItems = [
        ...existingItems.filter(
          (e) => !updatedItems.some((u) => u.productId === e.productId),
        ),
        ...updatedItems,
      ];

      return tx.supplierPortalUpload.update({
        where: { id: uploadId },
        data: { parsedItems: mergedItems as object[] },
      });
    });
  }
}

interface ParsedItem {
  productId: string;
  productName: string;
  oldPrice: number | null;
  newPrice: number;
  discountPct: number | null;
}

// |değişim| bu yüzdeyi aşarsa anomali olarak işaretlenir.
const PRICE_ANOMALY_PCT = 50;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// changePct kolonu Decimal(5,2) → maksimum ±999.99; taşmayı önlemek için sınırla.
function clampPct(n: number): number {
  return Math.max(-999.99, Math.min(999.99, n));
}
