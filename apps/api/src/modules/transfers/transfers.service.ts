import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';
import { CreateTransferDto, TransferQueryDto } from './dto/transfer.dto';

const TRANSFER_INCLUDE = {
  fromBranch: { select: { id: true, name: true } },
  toBranch:   { select: { id: true, name: true } },
  product:    { select: { id: true, sku: true, name: true, unit: true } },
  requester:  { select: { id: true, email: true } },
  approver:   { select: { id: true, email: true } },
  dispatcher: { select: { id: true, email: true } },
  receiver:   { select: { id: true, email: true } },
} as const;

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);

  constructor(
    private prisma: PrismaService,
    private sync: SyncService,
  ) {}

  async createTransfer(
    dto: CreateTransferDto,
    user: { tenantId: string; userId: string },
  ) {
    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException('Kaynak ve hedef şube aynı olamaz');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const [from, to] = await Promise.all([
        tx.branch.findUnique({ where: { id: dto.fromBranchId }, select: { tenantId: true } }),
        tx.branch.findUnique({ where: { id: dto.toBranchId }, select: { tenantId: true } }),
      ]);

      if (!from || from.tenantId !== user.tenantId) throw new NotFoundException('Kaynak şube bulunamadı');
      if (!to || to.tenantId !== user.tenantId) throw new NotFoundException('Hedef şube bulunamadı');

      return tx.stockTransfer.create({
        data: {
          tenantId: user.tenantId,
          fromBranchId: dto.fromBranchId,
          toBranchId: dto.toBranchId,
          productId: dto.productId,
          quantity: dto.quantity,
          status: 'REQUESTED',
          requestedBy: user.userId,
          notes: dto.notes,
        },
        include: TRANSFER_INCLUDE,
      });
    });
  }

  async listTransfers(
    branchId: string,
    query: TransferQueryDto,
    user: { tenantId: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const where: Prisma.StockTransferWhereInput = {
        tenantId: user.tenantId,
        OR: [{ fromBranchId: branchId }, { toBranchId: branchId }],
      };
      if (query.status) where.status = query.status;

      return tx.stockTransfer.findMany({
        where,
        include: TRANSFER_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async approveTransfer(transferId: string, user: { tenantId: string; userId: string; branchId?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const transfer = await tx.stockTransfer.findUnique({
        where: { id: transferId },
        select: { id: true, tenantId: true, fromBranchId: true, status: true },
      });

      if (!transfer || transfer.tenantId !== user.tenantId) throw new NotFoundException('Transfer bulunamadı');
      if (transfer.status !== 'REQUESTED') {
        throw new BadRequestException(`Yalnızca REQUESTED transferler onaylanabilir (mevcut: ${transfer.status})`);
      }
      if (user.branchId && transfer.fromBranchId !== user.branchId) {
        throw new BadRequestException('Yalnızca kaynak şubenin müdürü onaylayabilir');
      }

      return tx.stockTransfer.update({
        where: { id: transferId },
        data: { status: 'APPROVED', approvedBy: user.userId, approvedAt: new Date() },
        include: TRANSFER_INCLUDE,
      });
    });
  }

  async rejectTransfer(transferId: string, user: { tenantId: string; userId: string; branchId?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const transfer = await tx.stockTransfer.findUnique({
        where: { id: transferId },
        select: { id: true, tenantId: true, fromBranchId: true, status: true },
      });

      if (!transfer || transfer.tenantId !== user.tenantId) throw new NotFoundException('Transfer bulunamadı');
      if (transfer.status !== 'REQUESTED') {
        throw new BadRequestException(`Yalnızca REQUESTED transferler reddedilebilir (mevcut: ${transfer.status})`);
      }
      if (user.branchId && transfer.fromBranchId !== user.branchId) {
        throw new BadRequestException('Yalnızca kaynak şubenin müdürü reddedebilir');
      }

      return tx.stockTransfer.update({
        where: { id: transferId },
        data: { status: 'REJECTED' },
        include: TRANSFER_INCLUDE,
      });
    });
  }

  async dispatchTransfer(transferId: string, user: { tenantId: string; userId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const transfer = await tx.stockTransfer.findUnique({
        where: { id: transferId },
        select: { id: true, tenantId: true, status: true },
      });

      if (!transfer || transfer.tenantId !== user.tenantId) throw new NotFoundException('Transfer bulunamadı');
      if (transfer.status !== 'APPROVED') {
        throw new BadRequestException(`Yalnızca APPROVED transferler gönderilebilir (mevcut: ${transfer.status})`);
      }

      return tx.stockTransfer.update({
        where: { id: transferId },
        data: { status: 'IN_TRANSIT', dispatchedBy: user.userId, dispatchedAt: new Date() },
        include: TRANSFER_INCLUDE,
      });
    });
  }

  async receiveTransfer(transferId: string, user: { tenantId: string; userId: string }) {
    const delivered = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
      await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);

      const transfer = await tx.stockTransfer.findUnique({
        where: { id: transferId },
        select: {
          id: true, tenantId: true, status: true,
          fromBranchId: true, toBranchId: true,
          productId: true, quantity: true,
        },
      });

      if (!transfer || transfer.tenantId !== user.tenantId) throw new NotFoundException('Transfer bulunamadı');
      if (transfer.status !== 'IN_TRANSIT') {
        throw new BadRequestException(`Yalnızca IN_TRANSIT transferler teslim alınabilir (mevcut: ${transfer.status})`);
      }

      // a) fromBranch stok düş
      await tx.stockLevel.updateMany({
        where: { productId: transfer.productId, branchId: transfer.fromBranchId },
        data: {
          quantity: { decrement: transfer.quantity },
          version: { increment: 1 },
        },
      });

      // b) toBranch stok artır — hedef şubede kayıt yoksa oluştur
      await tx.stockLevel.upsert({
        where: {
          productId_branchId: {
            productId: transfer.productId,
            branchId: transfer.toBranchId,
          },
        },
        update: {
          quantity: { increment: transfer.quantity },
          version: { increment: 1 },
        },
        create: {
          tenantId: user.tenantId,
          productId: transfer.productId,
          branchId: transfer.toBranchId,
          quantity: transfer.quantity,
          minThreshold: new Prisma.Decimal(0),
        },
      });

      const now = new Date();

      // c) TRANSFER_OUT hareketi (fromBranch, negatif)
      await tx.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          productId: transfer.productId,
          branchId: transfer.fromBranchId,
          movementType: 'TRANSFER_OUT',
          quantity: transfer.quantity.negated(),
          referenceId: transfer.id,
          referenceType: 'STOCK_TRANSFER',
          createdBy: user.userId,
        },
      });

      // d) TRANSFER_IN hareketi (toBranch, pozitif)
      await tx.stockMovement.create({
        data: {
          tenantId: user.tenantId,
          productId: transfer.productId,
          branchId: transfer.toBranchId,
          movementType: 'TRANSFER_IN',
          quantity: transfer.quantity,
          referenceId: transfer.id,
          referenceType: 'STOCK_TRANSFER',
          createdBy: user.userId,
        },
      });

      // e) Transfer tamamla
      return tx.stockTransfer.update({
        where: { id: transferId },
        data: { status: 'DELIVERED', receivedBy: user.userId, receivedAt: now },
        include: TRANSFER_INCLUDE,
      });
    });

    // Fire-and-forget: enqueue sync for stock change notification
    this.enqueueSyncAfterReceive(delivered, user).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Sync] Transfer enqueue hatası: ${msg}`);
    });

    return delivered;
  }

  private async enqueueSyncAfterReceive(
    transfer: { id: string; toBranchId: string; productId: string; quantity: { toString(): string }; tenantId: string },
    user: { tenantId: string; userId: string },
  ) {
    const integration = await this.prisma.branchIntegration.findUnique({
      where: { branchId: transfer.toBranchId },
      select: { adapterType: true },
    });
    const adapterType = integration?.adapterType ?? 'UNKNOWN';

    await this.sync.addToQueue({
      tenantId:      user.tenantId,
      branchId:      transfer.toBranchId,
      operationType: 'STOCK_READ',
      payload:       { transferId: transfer.id, productId: transfer.productId, quantity: transfer.quantity.toString() },
      adapterType,
      createdBy:     user.userId,
    });
  }
}
