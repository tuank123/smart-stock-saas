import { HttpException } from '@nestjs/common';

/**
 * Kritik finansal/stok işlemlerinden sonraki matematiksel tutarlılık
 * kontrolleri başarısız olduğunda fırlatılır. Transaction içinde fırlatılır,
 * transaction'ı otomatik rollback eder. Çağıran taraf, client'a dönmeden önce
 * ErrorLog'a source:'DATA_INTEGRITY' ile elle kaydetmeli — bu exception'ın
 * kendisi 409 döndüğü için AllExceptionsFilter'ın otomatik ErrorLog yazımını
 * (yalnızca >=500'de tetiklenir) tetiklemez.
 */
export class DataIntegrityException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: 409,
        message: 'Bir tutarsızlık tespit edildi. Lütfen 30 dakika sonra tekrar deneyin.',
        detail: message,
      },
      409,
    );
  }
}
