import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { AgentAuthGuard, type AgentContext as AgentCtx } from '../../common/guards/agent-auth.guard';
import { AgentContext } from '../../common/decorators/agent-context.decorator';
import { AckJobDto, HeartbeatDto, InboundSyncDto } from './dto/agent.dto';
import { AgentService } from './agent.service';

// Agent kimlik doğrulaması X-Agent-Id / X-Agent-Key ile yapılır (JWT/Roles YOK).
// @Public() global JWT/Tenant/Roles guard'larını atlar; @UseGuards(AgentAuthGuard)
// API anahtarı doğrulamasını devreye alır ve req.agentContext'i doldurur.
@Public()
@UseGuards(AgentAuthGuard)
@Controller('agent')
export class AgentController {
  constructor(private service: AgentService) {}

  @Get('sync-queue')
  syncQueue(@AgentContext() ctx: AgentCtx) {
    return this.service.getPendingQueue(ctx.branchId, ctx.tenantId);
  }

  @Post('sync-queue/:id/ack')
  @HttpCode(200)
  ack(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AckJobDto,
    @AgentContext() ctx: AgentCtx,
  ) {
    return this.service.ackJob(id, dto, ctx.branchId, ctx.tenantId);
  }

  @Post('inbound-sync')
  @HttpCode(200)
  inboundSync(@Body() dto: InboundSyncDto, @AgentContext() ctx: AgentCtx) {
    return this.service.inboundSync(dto.products, ctx.branchId, ctx.tenantId);
  }

  @Post('heartbeat')
  @HttpCode(200)
  heartbeat(@Body() dto: HeartbeatDto, @AgentContext() ctx: AgentCtx) {
    return this.service.heartbeat(dto, ctx.branchId, ctx.tenantId);
  }
}
