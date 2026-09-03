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
  // user_feedback'in KENDİSİ RLS'siz (admin.service.ts:listErrors'daki gibi
  // doğrudan erişim yeterli olurdu) — AMA burada include:{tenant,user} ile
  // RLS'Lİ iki tabloya (tenants/users) JOIN yapılıyor. app.tenant_id/
  // app.is_super_admin hiç set edilmeden bu join'e girmek, havuzlanmış bir
  // bağlantıda DAHA ÖNCE başka bir withTenantContext çağrısı app.tenant_id'yi
  // SET LOCAL etmişse (bu dosyadaki create() gibi) o bağlantıda KALICI olarak
  // ''::uuid'e dönüşmesine (bkz. tenant-context.ts'teki SET LOCAL notu) ve
  // RLS policy'sinin cast hatasıyla patlamasına yol açar — CI'da (RLS gerçekten
  // zorlanan ortam) tam olarak bu oldu, yerelde stok_user RLS bypass ettiği
  // için görünmedi. Bu yüzden admin.service.ts:listTenants/getTenantDetail ile
  // AYNI desen: isSuperAdmin:true ile bağlam açıkça kuruluyor.
  async listAll(query: ListFeedbackQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    return withTenantContext(this.prisma, { isSuperAdmin: true }, async (tx) => {
      const [items, total] = await Promise.all([
        tx.userFeedback.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            tenant: { select: { id: true, companyName: true } },
            user: { select: { id: true, email: true, fullName: true } },
          },
        }),
        tx.userFeedback.count(),
      ]);

      return { items, total, page, pageSize };
    });
  }

  // markRead: RLS'li hiçbir tabloya JOIN yapmıyor (userFeedback.update'in
  // include'u yok) — admin.service.ts:resolveError ile aynı gerekçeyle
  // doğrudan this.prisma üzerinden erişim güvenli.
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

  // Sidebar badge'i için hafif sorgu — admin.service.ts:getUnresolvedErrorCount
  // ile aynı desen. JOIN yok, RLS'li tabloya dokunmuyor — wrapper gerekmiyor.
  async getUnreadCount() {
    const count = await this.prisma.userFeedback.count({ where: { status: 'NEW' } });
    return { count };
  }
}
