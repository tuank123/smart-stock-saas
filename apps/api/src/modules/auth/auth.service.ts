import { Injectable, BadRequestException, UnauthorizedException, Logger, OnModuleInit, OnModuleDestroy, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { createClient, RedisClientType } from 'redis';
import { PrismaService } from '../../prisma/prisma.service';
import { SecurityEventLogger } from '../../common/security-event/security-event.service';
import { withTenantContext } from '../../common/utils/tenant-context';
import { EmailService } from '../email/email.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthResponse } from './dto/auth-response.dto';

/** Şifre sıfırlama isteğinde her zaman dönen genel mesaj (e-posta varlığını sızdırmaz). */
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'Eğer bu e-posta adresi kayıtlıysa, şifre sıfırlama bağlantısı gönderildi.';

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private redisClient: RedisClientType | null = null;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private securityEvents: SecurityEventLogger,
  ) {}

  async onModuleInit() {
    await this.initRedis();
  }

  /**
   * Redis bağlantısını kapatır. Bu olmadan soket açık kalıyor: uygulama
   * app.close() sonrası sonlanmıyor (e2e testlerinde "Jest did not exit"),
   * production'da da graceful shutdown yarım kalıyordu.
   */
  async onModuleDestroy() {
    if (!this.redisClient) return;
    try {
      await this.redisClient.quit();
    } catch {
      // Bağlantı zaten kopmuşsa quit() hata verebilir — kapanışı engellemesin.
    } finally {
      this.redisClient = null;
    }
  }

  private async initRedis() {
    try {
      this.redisClient = createClient({
        url: this.configService.get('REDIS_URL'),
      });
      await this.redisClient.connect();
      this.logger.log('✅ Redis connected for token blacklist');
    } catch (error) {
      this.logger.error('❌ Redis connection failed:', error);
      // Continue even if Redis fails - fallback mode
    }
  }

  /**
   * Login user with email and password
   * Returns access token (in response body) + refresh token (in HttpOnly cookie)
   */
  async login(loginDto: LoginDto, ip?: string | null): Promise<AuthResponse> {
    const { email, password } = loginDto;

    // Check rate limiting (5 attempts per 15 minutes)
    if (this.redisClient) {
      try {
        const rateLimitKey = `rate_limit:login:${email}`;
        const attempts = await this.redisClient.incr(rateLimitKey);

        if (attempts === 1) {
          // Set expiration only on first increment
          await this.redisClient.expire(
            rateLimitKey,
            Math.floor(this.configService.get('RATE_LIMIT_WINDOW_MS', 900000) / 1000),
          );
        }

        if (attempts > this.configService.get('RATE_LIMIT_MAX_REQUESTS', 5)) {
          throw new BadRequestException(
            'Too many login attempts. Please try again later.',
          );
        }
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        this.logger.warn('Rate limit check failed, continuing without limit');
      }
    }

    // E-postaya göre global kullanıcı araması (tenant bağlamı yok → super-admin RLS).
    const users = await withTenantContext(this.prisma, { isSuperAdmin: true }, async (tx) => {
      return tx.user.findMany({
        where: { email, deletedAt: null },
        include: { tenant: true, branch: true },
      });
    });

    // Tek kayıt → onu kullan. Birden fazla (aynı email farklı tenant'larda) →
    // ilk aktif olanı seç. Boş veya seçilen kayıt aktif değilse: kimlik sızdırma.
    const user =
      users.length === 1 ? users[0] : (users.find((u) => u.isActive) ?? null);

    if (!user || !user.isActive) {
      // DİKKAT: loginDto.password ASLA loglanmaz — yalnızca email+IP (brute-
      // force paterni tespiti için yeterli, sır içermiyor).
      this.securityEvents.log({
        eventType: 'LOGIN_FAILED',
        message: 'Başarısız giriş denemesi (kullanıcı yok/pasif)',
        ip,
        email,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.securityEvents.log({
        eventType: 'LOGIN_FAILED',
        message: 'Başarısız giriş denemesi (yanlış şifre)',
        ip,
        email,
        userId: user.id,
        tenantId: user.tenantId,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Tenant sonlandırılmışsa (DELETED/SUSPENDED) girişi engelle.
    if (user.tenant?.status !== 'ACTIVE') {
      this.securityEvents.log({
        eventType: 'LOGIN_FAILED',
        message: 'Başarısız giriş denemesi (tenant kapatılmış)',
        ip,
        email,
        userId: user.id,
        tenantId: user.tenantId,
      });
      throw new UnauthorizedException('Bu hesap kapatılmış. Giriş yapılamıyor.');
    }

    // Update last login — RLS altında; getMe'deki düzeltmeyle aynı gerekçe:
    // bağlam kurulmadan çağrılırsa, havuzlanmış bağlantıda kalan BAŞKA bir
    // tenant'ın app.tenant_id'si yüzünden bu update sessizce 0 satır etkileyebilir.
    await withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    });

    // Clear rate limit on successful login
    if (this.redisClient) {
      try {
        const rateLimitKey = `rate_limit:login:${email}`;
        await this.redisClient.del(rateLimitKey);
      } catch (error) {
        this.logger.warn('Failed to clear rate limit on successful login');
      }
    }

    // Generate tokens
    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);

    this.logger.log(`✅ User logged in: ${user.email}`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId ?? null,
        planId: user.tenant?.planId ?? null,
      },
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      // Check if refresh token is blacklisted
      if (this.redisClient) {
        try {
          const isBlacklisted = await this.redisClient.get(
            `refresh_token_blacklist:${refreshToken}`,
          );

          if (isBlacklisted) {
            throw new UnauthorizedException('Refresh token has been revoked');
          }
        } catch (error) {
          if (error instanceof UnauthorizedException) throw error;
          this.logger.warn('Blacklist check failed, continuing without check');
        }
      }

      // Get user — henüz tenant bağlamı yok (refresh token payload'ı yalnızca
      // userId/email taşır); login()'in ilk e-posta aramasıyla ve
      // findUserByIdGlobal ile aynı gerekçeyle super-admin RLS bypass'ı
      // kullanılıyor (tenant-agnostic, id ile tekil arama).
      const user = await withTenantContext(this.prisma, { isSuperAdmin: true }, async (tx) => {
        return tx.user.findUnique({
          where: { id: payload.userId },
          include: {
            tenant: true,
            branch: true,
          },
        });
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Tenant sonlandırılmışsa yenilemeyi de engelle.
      if (user.tenant?.status !== 'ACTIVE') {
        throw new UnauthorizedException('Bu hesap kapatılmış. Giriş yapılamıyor.');
      }

      // Generate new tokens
      const newAccessToken = await this.generateAccessToken(user);
      const newRefreshToken = await this.generateRefreshToken(user);

      this.logger.log(`✅ Token refreshed for user: ${user.email}`);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          branchId: user.branchId,
          planId: user.tenant?.planId ?? null,
        },
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Logout - blacklist refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      // Add to blacklist with TTL
      if (this.redisClient) {
        try {
          const ttl = this.configService.get('JWT_REFRESH_EXPIRATION', 604800);
          await this.redisClient.setEx(
            `refresh_token_blacklist:${refreshToken}`,
            ttl,
            '1',
          );
        } catch (error) {
          this.logger.warn('Failed to blacklist token on logout');
        }
      }

      this.logger.log(`✅ User logged out: ${payload.userId}`);
    } catch (error) {
      this.logger.warn('⚠️  Logout failed for invalid token');
    }
  }

  /**
   * GET /auth/me — current user + tenant info
   */
  async getMe(userId: string, tenantId: string) {
    // users/tenants RLS altında — diğer tüm tenant-scoped metotlarla aynı
    // desen: app.tenant_id burada AÇIKÇA set edilmeli. Önceden bu eksikti;
    // sorgular bağlam kurmadan doğrudan this.prisma.* üzerinden çalışıyordu,
    // bu da RLS'in gerçekten zorlandığı ortamlarda (CI, production) hangi
    // pooled bağlantının seçildiğine bağlı olarak (bir önceki sorgunun
    // set ettiği app.tenant_id kalıntısı — Postgres'te düz SET, SET LOCAL
    // gibi transaction'a değil SESSION'a/bağlantıya bağlıdır) rastgele
    // "kullanıcı bulunamadı" (404) sonucuna yol açabiliyordu. Yerelde RLS
    // bypass edildiği (stok_user superuser/sahip) için bu hiç görünmüyordu.
    const [user, tenant] = await withTenantContext(this.prisma, { tenantId }, async (tx) => {
      return Promise.all([
        tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            role: true,
            branchId: true,
            emailVerified: true,
            createdAt: true,
          },
        }),
        tx.tenant.findUnique({
          where: { id: tenantId },
          select: {
            id: true,
            companyName: true,
            taxNumber: true,
            status: true,
            planId: true,
            settings: true,
          },
        }),
      ]);
    });

    if (!user || !tenant) {
      throw new NotFoundException('User or tenant not found');
    }

    return { user, tenant };
  }

  /**
   * PATCH /auth/change-password
   */
  async changePassword(userId: string, tenantId: string, dto: ChangePasswordDto) {
    const user = await withTenantContext(this.prisma, { tenantId }, async (tx) => {
      return tx.user.findUnique({ where: { id: userId } });
    });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Mevcut şifre hatalı');

    const rounds = process.env.BCRYPT_ROUNDS ? parseInt(process.env.BCRYPT_ROUNDS, 10) : 12;
    const hash = await bcrypt.hash(dto.newPassword, rounds);
    await withTenantContext(this.prisma, { tenantId }, async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: hash },
      });
    });

    return { message: 'Şifre güncellendi' };
  }

  /**
   * Şifre doğrulama (changePassword ile aynı bcrypt.compare deseni).
   * Yanlış şifrede exception fırlatmaz — { valid: false } döner.
   */
  async verifyPassword(userId: string, tenantId: string, password: string): Promise<{ valid: boolean }> {
    const user = await withTenantContext(this.prisma, { tenantId }, async (tx) => {
      return tx.user.findUnique({ where: { id: userId } });
    });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(password, user.passwordHash);
    return { valid };
  }

  // ============================================
  // Şifre sıfırlama
  // ============================================

  /**
   * POST /auth/forgot-password
   * Kullanıcı bulunsun ya da bulunmasın HER ZAMAN aynı mesajı döner — e-postanın
   * sistemde kayıtlı olup olmadığı sızdırılmaz.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    // E-postaya göre global arama (tenant bağlamı yok → super-admin RLS bypass),
    // login'deki desenle aynı.
    const users = await withTenantContext(this.prisma, { isSuperAdmin: true }, async (tx) => {
      return tx.user.findMany({
        where: { email, deletedAt: null },
        select: { id: true, email: true, isActive: true },
      });
    });

    const user =
      users.length === 1 ? users[0] : (users.find((u) => u.isActive) ?? null);

    if (!user || !user.isActive) {
      this.logger.warn(`Şifre sıfırlama: eşleşen aktif kullanıcı yok (${email})`);
      return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 saat

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    const link = `${this.appUrl()}/sifre-sifirla?token=${token}`;
    await this.emailService.sendEmail(
      user.email,
      'Şifre Sıfırlama',
      `Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:\n${link}\n\n` +
        `Bağlantı 1 saat geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.`,
    );

    this.logger.log(`✅ Şifre sıfırlama bağlantısı gönderildi: ${user.email}`);
    return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
  }

  /**
   * POST /auth/reset-password
   * Token geçerliyse şifreyi günceller ve kullanıcının TÜM kullanılmamış
   * sıfırlama token'larını geçersiz kılar (tek kullanımlık).
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { token, used: false, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true },
    });

    if (!record) {
      throw new BadRequestException('Geçersiz veya süresi dolmuş bağlantı');
    }

    const rounds = process.env.BCRYPT_ROUNDS ? parseInt(process.env.BCRYPT_ROUNDS, 10) : 12;
    const hash = await bcrypt.hash(newPassword, rounds);

    await withTenantContext(this.prisma, { isSuperAdmin: true }, async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash: hash },
      });

      // Kullanılan token dahil, o kullanıcının bekleyen tüm token'ları kapanır.
      await tx.passwordResetToken.updateMany({
        where: { userId: record.userId, used: false },
        data: { used: true },
      });
    });

    this.logger.log(`✅ Şifre sıfırlandı: user ${record.userId}`);
    return { message: 'Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.' };
  }

  // ============================================
  // E-posta doğrulama
  // ============================================

  /**
   * Doğrulama token'ı üretip mock e-posta gönderir. Signup sonrası TenantsService
   * tarafından da çağrıldığı için public.
   */
  async sendVerificationEmail(userId: string): Promise<void> {
    const user = await this.findUserByIdGlobal(userId, { email: true });
    if (!user) throw new NotFoundException('User not found');

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 saat

    await this.prisma.emailVerificationToken.create({
      data: { userId, token, expiresAt },
    });

    const link = `${this.appUrl()}/email-dogrula?token=${token}`;
    await this.emailService.sendEmail(
      user.email,
      'E-posta Adresinizi Doğrulayın',
      `Hesabınızı etkinleştirmek için aşağıdaki bağlantıya tıklayın:\n${link}\n\n` +
        `Bağlantı 24 saat geçerlidir.`,
    );

    this.logger.log(`✅ Doğrulama e-postası gönderildi: ${user.email}`);
  }

  /**
   * POST /auth/verify-email
   * Token geçerliyse kullanıcıyı doğrulanmış işaretler ve token'ları siler.
   */
  async verifyEmail(token: string): Promise<{ message: string }> {
    const record = await this.prisma.emailVerificationToken.findFirst({
      where: { token, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true },
    });

    if (!record) {
      throw new BadRequestException('Geçersiz veya süresi dolmuş doğrulama bağlantısı');
    }

    await withTenantContext(this.prisma, { isSuperAdmin: true }, async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerified: true },
      });

      // Tek kullanımlık: kullanıcının bekleyen tüm doğrulama token'ları silinir.
      await tx.emailVerificationToken.deleteMany({
        where: { userId: record.userId },
      });
    });

    this.logger.log(`✅ E-posta doğrulandı: user ${record.userId}`);
    return { message: 'E-posta adresiniz doğrulandı.' };
  }

  /**
   * POST /auth/resend-verification (JWT gerektirir)
   */
  async resendVerification(userId: string): Promise<{ message: string }> {
    const user = await this.findUserByIdGlobal(userId, { emailVerified: true });
    if (!user) throw new NotFoundException('User not found');

    if (user.emailVerified) {
      throw new BadRequestException('E-posta adresiniz zaten doğrulanmış');
    }

    // Eski token'ları temizle → aynı anda yalnızca bir geçerli bağlantı olsun.
    await this.prisma.emailVerificationToken.deleteMany({ where: { userId } });
    await this.sendVerificationEmail(userId);

    return { message: 'Doğrulama e-postası tekrar gönderildi.' };
  }

  /** Frontend taban adresi (sıfırlama/doğrulama linkleri için). */
  private appUrl(): string {
    return this.configService.get<string>('APP_URL', 'http://localhost:3001');
  }

  /**
   * users tablosu RLS altında olduğu ve bu akışlarda tenant bağlamı bulunmadığı
   * için kullanıcıyı super-admin bypass'ıyla id'den okur.
   */
  private async findUserByIdGlobal<T extends Record<string, true>>(
    userId: string,
    extraSelect: T,
  ): Promise<({ id: string; email: string } & Record<keyof T, any>) | null> {
    const users = await withTenantContext(this.prisma, { isSuperAdmin: true }, async (tx) => {
      return tx.user.findMany({
        where: { id: userId, deletedAt: null },
        select: { id: true, email: true, ...extraSelect },
      });
    });
    return (users[0] as any) ?? null;
  }

  /**
   * Generate access token (15 minutes)
   */
  private async generateAccessToken(user: any): Promise<string> {
    return this.jwtService.signAsync(
      {
        userId: user.id,
        email: user.email,
        tenantId: user.tenantId,
        branchId: user.branchId ?? null,
        role: user.role,
        // login/refresh: user.tenant.planId; issueTokens: user.planId (düz alan)
        planId: user.planId ?? user.tenant?.planId ?? null,
        type: 'access',
      },
      {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRATION', 900),
      },
    );
  }

  /**
   * Generate refresh token (7 days)
   */
  private async generateRefreshToken(user: any): Promise<string> {
    return this.jwtService.signAsync(
      {
        userId: user.id,
        email: user.email,
        type: 'refresh',
      },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION', 604800),
      },
    );
  }

  /**
   * Public helper: issue an access + refresh token pair for a user. Reuses the
   * same signing logic as login so other flows (e.g. tenant signup) don't
   * duplicate token generation.
   */
  async issueTokens(user: {
    id: string;
    email: string;
    tenantId: string;
    branchId: string | null;
    role: string | null;
    planId?: string | null;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user);
    return { accessToken, refreshToken };
  }

  /**
   * Verify and return user from refresh token
   */
  async getUserFromRefreshToken(refreshToken: string): Promise<any> {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
