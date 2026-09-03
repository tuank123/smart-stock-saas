import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { withTenantContext } from '../../common/utils/tenant-context';
import { CreateFeedbackDto, ListFeedbackQueryDto } from './dto/feedback.dto';

type FeedbackUser = {
  tenantId: string;
  userId: string;
  role?: string | null;
  planId?: string | null;
};

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  /**
   * POST /feedback — yalnızca tek şubeli (STARTER) PATRON.
   *
   * debts/portal servislerindeki "PATRON && planId !== 'STARTER' →
   * Forbidden" deseniyle aynı fikir, ama TERS yazılmış: o servisler
   * @Roles(SUBE_MUDURU, PATRON) ile birden fazla rolü kabul ettiği için
   * yalnızca PATRON dalını daraltıyorlar (`role==='PATRON' && planId!==
   * 'STARTER'`). Bu uç nokta @Roles(PATRON) ile zaten TEK rolü kabul
   * ediyor — ama RolesGuard, SUPER_ADMIN'i TÜM @Roles() kontrollerinden
   * muaf tutuyor (bkz. roles.guard.ts), yani bir SUPER_ADMIN buraya kadar
   * gelebilir. `role !== 'PATRON'` negatif kontrolü bu durumu da kapatır —
   * yalnızca gerçekten PATRON+STARTER olan istekler geçer.
   */
  async create(dto: CreateFeedbackDto, user: FeedbackUser) {
    if (user.role !== 'PATRON' || user.planId !== 'STARTER') {
      throw new ForbiddenException(
        'Bu özellik yalnızca tek şubeli (STARTER planlı) işletme sahipleri için kullanılabilir',
      );
    }

    return withTenantContext(this.prisma, { tenantId: user.tenantId }, async (tx) => {
      return tx.userFeedback.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          subject: dto.subject,
          message: dto.message,
        },
      });
    });
  }

  // ── Admin (SUPER_ADMIN) ───────────────────────────────────────────────────
  // user_feedback RLS'siz — admin.service.ts:listErrors ile aynı desen:
  // doğrudan this.prisma üzerinden erişim (bkz. schema.prisma'daki model yorumu).

  async listAll(query: ListFeedbackQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [items, total] = await Promise.all([
      this.prisma.userFeedback.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          tenant: { select: { id: true, companyName: true } },
          user: { select: { id: true, email: true, fullName: true } },
        },
      }),
      this.prisma.userFeedback.count(),
    ]);

    return { items, total, page, pageSize };
  }

  async markRead(id: string) {
    const existing = await this.prisma.userFeedback.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Geri bildirim bulunamadı');
    }

    return this.prisma.userFeedback.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() },
    });
  }
}
