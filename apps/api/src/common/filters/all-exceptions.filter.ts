import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly prisma: PrismaService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message = exception.message;

      if (typeof exceptionResponse === 'object' && 'message' in exceptionResponse) {
        const res = exceptionResponse as any;
        message = res.message;
        if (res.error) {
          errors = res.error;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      ...(errors && { errors }),
    };

    // Beklenmeyen sunucu hataları (>= 500): logla + ErrorLog'a kaydet.
    // 4xx (400/401/403/404 gibi beklenen kullanıcı hataları) kaydedilmez.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : JSON.stringify(exception),
      );

      // ErrorLog RLS'siz sistem tablosu — doğrudan yazılır. Kayıt sırasında bir
      // hata olursa asıl yanıt bloke edilmemeli.
      try {
        await this.prisma.errorLog.create({
          data: {
            source: 'API_EXCEPTION',
            severity: 'ERROR',
            message:
              typeof message === 'string' ? message : JSON.stringify(message),
            stackTrace: exception instanceof Error ? exception.stack : null,
            context: { path: request.url, method: request.method },
          },
        });
      } catch (logErr) {
        this.logger.error('ErrorLog kaydı başarısız', logErr as Error);
      }
    }

    response.status(status).json(errorResponse);
  }
}
