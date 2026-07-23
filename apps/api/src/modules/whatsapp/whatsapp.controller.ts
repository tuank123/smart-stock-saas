import { Body, Controller, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(
    private readonly service: WhatsappService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /whatsapp/webhook — Meta doğrulama handshake'i.
   * Query: hub.mode, hub.verify_token, hub.challenge.
   * verify_token eşleşirse challenge'ı düz metin döner (200), aksi halde 403.
   */
  @Public()
  @Get('webhook')
  verify(@Query() query: Record<string, string>, @Res() res: Response): void {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    const expected = this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN');

    if (mode === 'subscribe' && token && expected && token === expected) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send('Forbidden');
  }

  /**
   * POST /whatsapp/webhook — gelen mesaj bildirimleri.
   * Her zaman 200 döneriz (Meta retry'ını önlemek için); işleme servise devredilir.
   */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async receive(@Body() payload: unknown): Promise<{ received: true }> {
    await this.service.handleIncomingMessage(payload);
    return { received: true };
  }
}
