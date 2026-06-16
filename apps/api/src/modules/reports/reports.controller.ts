import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { GenerateDailyReportDto, GenerateMonthlyReportDto, ReportQueryDto } from './dto/report.dto';
import { ReportsService } from './reports.service';

@Roles(UserRole.PATRON)
@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Post('generate/daily')
  generateDaily(
    @Body() dto: GenerateDailyReportDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.generateDailyReport(user.tenantId, dto.date);
  }

  @Post('generate/monthly')
  generateMonthly(
    @Body() dto: GenerateMonthlyReportDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.generateMonthlyReport(user.tenantId, dto.year, dto.month);
  }

  // NOTE: static route "anomalies" must be defined before :reportId
  @Get('anomalies')
  getAnomalies(@CurrentUser() user: { tenantId: string }) {
    return this.service.detectPriceAnomalies(user.tenantId);
  }

  @Get()
  list(
    @Query() query: ReportQueryDto,
    @CurrentUser() user: { tenantId: string },
  ) {
    return this.service.listReports(user.tenantId, query.type, query.unreadOnly);
  }

  @Get(':reportId')
  async getOne(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @CurrentUser() user: { tenantId: string },
  ) {
    const report = await this.service.getReport(reportId, user.tenantId);
    if (!report) throw new NotFoundException('Rapor bulunamadı');
    return report;
  }
}
