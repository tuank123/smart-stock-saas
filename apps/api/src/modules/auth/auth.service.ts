import { Injectable, BadRequestException, UnauthorizedException, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createClient, RedisClientType } from 'redis';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthResponse } from './dto/auth-response.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private redisClient: RedisClientType | null = null;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.initRedis();
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
  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const { email, password, tenantId } = loginDto;

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

    // Find user
    const user = await this.prisma.user.findUnique({
      where: {
        tenantId_email: {
          tenantId,
          email,
        },
      },
      include: {
        tenant: true,
        branch: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
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
        branchId: user.branchId ?? undefined ?? undefined,
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

      // Get user
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        include: {
          tenant: true,
          branch: true,
        },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
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
    const [user, tenant] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          branchId: true,
          createdAt: true,
        },
      }),
      this.prisma.tenant.findUnique({
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

    if (!user || !tenant) {
      throw new NotFoundException('User or tenant not found');
    }

    return { user, tenant };
  }

  /**
   * PATCH /auth/change-password
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Mevcut şifre hatalı');

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash },
    });

    return { message: 'Şifre güncellendi' };
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
