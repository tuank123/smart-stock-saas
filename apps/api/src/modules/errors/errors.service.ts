import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportFrontendErrorDto } from './dto/error.dto';

@Injectable()
export class ErrorsService {
  private readonly logger = new Logger(ErrorsService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  // Bu uç @Public() — kullanıcının oturumu tam da hatanın sebebi olabileceği
  // için kimlik doğrulama ZORUNLU değil. Ama Authorization header'ı varsa
  // (kullanıcı o an giriş yapılıysa) tenantId/userId'yi context'e eklemek
  // için best-effort çözülür — token geçersiz/süresi dolmuş olsa bile bu
  // isteği ASLA reddetmemeli, sadece anonim kaydeder.
  private async resolveIdentity(
    authHeader: string | undefined,
  ): Promise<{ tenantId: string | null; userId: string | null }> {
    if (!authHeader) return { tenantId: null, userId: null };

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) return { tenantId: null, userId: null };

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get('JWT_SECRET'),
      });
      if (payload.type !== 'access') return { tenantId: null, userId: null };
      return {
        tenantId: payload.tenantId ?? null,
        userId: payload.userId ?? null,
      };
    } catch {
      return { tenantId: null, userId: null };
    }
  }

  async reportFrontendError(
    dto: ReportFrontendErrorDto,
    authHeader: string | undefined,
  ): Promise<{ success: boolean }> {
    const { tenantId, userId } = await this.resolveIdentity(authHeader);

    // RLS'siz sistem tablosu (ErrorLog) — doğrudan yazılır. Bu uç zaten
    // fire-and-forget olarak tüketiliyor (frontend ErrorBoundary), bu yüzden
    // burada bir yazma hatası sessizce loglanıp yine de {success:true}
    // dönülür — çağıran taraf (çökmüş bir ekran) bunu yeniden denemeyecek.
    try {
      await this.prisma.errorLog.create({
        data: {
          source: 'FRONTEND_ERROR',
          severity: 'ERROR',
          message: dto.message,
          stackTrace: dto.stack ?? null,
          tenantId,
          context: {
            url: dto.url,
            userAgent: dto.userAgent ?? null,
            componentStack: dto.componentStack ?? null,
            userId,
          },
        },
      });
    } catch (err) {
      this.logger.error('Frontend ErrorLog kaydı başarısız', err as Error);
    }

    return { success: true };
  }
}
