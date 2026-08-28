import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { SecurityEventLogger } from '../security-event/security-event.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly securityEvents: SecurityEventLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // Check if route is public
      const isPublic = this.reflector?.getAllAndOverride<boolean>('isPublic', [
        context.getHandler(),
        context.getClass(),
      ]);

      if (isPublic) {
        return true;
      }
    } catch (error) {
      // Continue with normal auth if reflector fails
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      this.securityEvents.log({
        eventType: 'JWT_REJECTED',
        message: 'Erişim token\'ı eksik',
        ip: request.ip,
        path: request.originalUrl ?? request.url,
      });
      throw new UnauthorizedException('Access token is missing');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      // Attach user info to request
      request.user = payload;
      request.tenantId = payload.tenantId;

      return true;
    } catch (error) {
      this.securityEvents.log({
        eventType: 'JWT_REJECTED',
        message: 'Geçersiz veya süresi dolmuş erişim token\'ı',
        ip: request.ip,
        path: request.originalUrl ?? request.url,
      });
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extractToken(request: Request): string | undefined {
    const authHeader = (request.headers as any).authorization;

    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer') {
      return undefined;
    }

    return token;
  }
}
