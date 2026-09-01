/**
 * Faz C — AuthService.initRedis()'in Redis'e bağlanamama senaryosu.
 *
 * BİLİNÇLİ OLARAK createTestApp() (tam NestJS app + gerçek DB/Redis
 * bootstrap) KULLANILMIYOR: initRedis() başarısız bir bağlantıyı gerçekten
 * tetiklemek için ya (a) ağ seviyesinde ulaşılamaz bir adrese bağlanmayı
 * dener — bu, node-redis'in kendi deneme/reconnect mantığı yüzünden test
 * timeout'unu aşacak kadar uzun sürebiliyor (ampirik olarak doğrulandı) — ya
 * da (b) sözdizimsel olarak geçersiz bir URL kullanılır, ki bu durumda
 * createClient() SENKRON olarak fırlatır (network I/O'ya hiç gitmeden).
 * İkinci yöntem hızlı ve deterministik, ama SecurityEventLogger'ın GERÇEK
 * DB'ye (ErrorLog) yazdığını uçtan uca kanıtlamak için hâlâ gerçek bir
 * PrismaService bağlantısı gerekiyor — bu yüzden yalnızca AuthService'i,
 * gerçek olmayan (mock) diğer bağımlılıklarla (Jwt/Email/Config) ama GERÇEK
 * PrismaService + SecurityEventLogger ile izole bir Test.createTestingModule
 * içinde kuruyoruz. Böylece hem gerçek kod yolu (initRedis→catch→
 * securityEvents.log→ErrorLog.create) uçtan uca çalışır, hem de tüm ağır
 * app/HTTP/signup altyapısından bağımsız, hızlı ve deterministik kalır.
 */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/modules/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SecurityEventLogger } from '../src/common/security-event/security-event.service';
import { EmailService } from '../src/modules/email/email.service';

describe('AuthService.initRedis() — Redis bağlantı hatası ErrorLog\'a taşınır (izole)', () => {
  it('createClient geçersiz REDIS_URL ile senkron reddederse SecurityEventLogger.log REDIS_CONNECTION_FAILED (severity:CRITICAL) ile çağrılır ve ErrorLog\'a gerçekten yazılır', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            // DATABASE_URL/NODE_ENV — PrismaService'in KENDİ constructor'ının
            // ihtiyaç duyduğu değerler; jest-e2e.json'daki setupFiles
            // (test/load-env.ts) bu dosya yüklenmeden ÖNCE zaten process.env'e
            // yazdığı için buradan aynen geçiriliyor — PrismaService gerçek
            // test veritabanına (stok_test) bağlanabilsin diye.
            get: (key: string) => {
              // Sözdizimsel olarak GEÇERSİZ — createClient() bunu network
              // I/O'ya hiç gitmeden SENKRON olarak reddeder (ampirik olarak
              // doğrulandı: node -e ile createClient({url:'not-a-valid-...'})
              // "Invalid URL" ile anında fırlatıyor).
              if (key === 'REDIS_URL') return 'not-a-valid-redis-url';
              if (key === 'DATABASE_URL') return process.env.DATABASE_URL;
              if (key === 'NODE_ENV') return process.env.NODE_ENV;
              return undefined;
            },
          },
        },
        { provide: JwtService, useValue: {} },
        { provide: EmailService, useValue: {} },
        SecurityEventLogger,
      ],
    }).compile();

    const prisma = moduleRef.get(PrismaService);
    await prisma.$connect();

    const authService = moduleRef.get(AuthService);
    const securityEvents = moduleRef.get(SecurityEventLogger);
    const logSpy = jest.spyOn(securityEvents, 'log');

    try {
      // Private metot — bilerek doğrudan çağrılıyor (onModuleInit'in kendisi
      // yerine): bu izole modülde OnModuleInit lifecycle hook'u otomatik
      // tetiklenmiyor (yalnızca gerçek bir Nest app.init() bunu yapar).
      await (authService as unknown as { initRedis(): Promise<void> }).initRedis();

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'REDIS_CONNECTION_FAILED',
          severity: 'CRITICAL',
        }),
      );

      // Gerçekten ErrorLog'a (fire-and-forget) yazıldığını da doğrula —
      // context.eventType JSON alanında olduğu için DB seviyesinde where ile
      // filtrelenemiyor; yazım henüz landmemişse kısa bir polling ile beklenir.
      let match: { severity: string } | undefined;
      const start = Date.now();
      while (Date.now() - start < 1000) {
        const logs = await prisma.errorLog.findMany({
          where: { source: 'SECURITY_EVENT' },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        match = logs.find(
          (l) => (l.context as { eventType?: string } | null)?.eventType === 'REDIS_CONNECTION_FAILED',
        );
        if (match) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(match).toBeDefined();
      expect(match!.severity).toBe('CRITICAL');
    } finally {
      logSpy.mockRestore();
      await prisma.$disconnect();
      await moduleRef.close();
    }
  });
});
