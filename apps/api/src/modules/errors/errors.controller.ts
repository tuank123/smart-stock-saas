import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ErrorsService } from './errors.service';
import { ReportFrontendErrorDto } from './dto/error.dto';

@Controller('errors')
export class ErrorsController {
  constructor(private service: ErrorsService) {}

  // Kimlik doğrulama gerektirmez — hatanın kendisi kullanıcının oturumunu
  // bozmuş olabilir (bkz. errors.service.ts). Kötüye kullanımı (ör. sonsuz
  // render döngüsünün saniyede onlarca istek atması) sınırlamak için IP
  // bazlı dakikada 10 istekle throttle edilir.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('frontend')
  @HttpCode(201)
  reportFrontendError(
    @Body() dto: ReportFrontendErrorDto,
    @Headers('authorization') authHeader: string | undefined,
  ) {
    return this.service.reportFrontendError(dto, authHeader);
  }
}
