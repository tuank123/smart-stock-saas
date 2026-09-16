import { Prisma } from '@prisma/client';

export type RebateType = 'CIRO_PRIMI' | 'FIRMA_GERI_ODEMESI';

const REBATE_LABELS: Record<RebateType, string> = {
  CIRO_PRIMI: 'Ciro primi',
  FIRMA_GERI_ODEMESI: 'Firma geri ödemesi',
};

/**
 * OCR fatura onayı (ocr.service.ts) ve manuel borç girişi (debts.service.ts)
 * arasında paylaşılan tek mantık: bir PAYABLE/CASH borç oluşturulurken
 * tedarikçinin bildirdiği bir ciro primi/firma geri ödemesi HEMEN mahsup
 * edilmişse, bunu (a) o borcun ödeme geçmişinde (DebtPayment) görünür kılar
 * — recordCashPayment'ın dayandığı "remainingAmount + Σpayments == amount"
 * bütünlük değişmezini bozmadan — ve (b) tedarikçiye ait, zaten kapanmış
 * (status:'PAID') ayrı bir RECEIVABLE borç kaydı oluşturup relatedDebtId ile
 * PAYABLE'a bağlar.
 *
 * ÇAĞIRANIN SORUMLULUĞU: PAYABLE borcun kendisi (amount/remainingAmount/
 * category) bu fonksiyon çağrılmadan ÖNCE, kendi create() çağrısında zaten
 * rebateAmount düşülerek oluşturulmuş olmalı — bu fonksiyon yalnızca REVİZE
 * EDİLMİŞ o borcun ID'sini alır, kendisi remainingAmount'a dokunmaz.
 */
export async function createRebateRecords(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    branchId: string;
    supplierId: string;
    payableDebtId: string;
    rebateAmount: number;
    rebateType: RebateType;
    userId: string;
    source: 'MANUAL' | 'OCR';
  },
): Promise<{ receivableDebtId: string }> {
  await tx.debtPayment.create({
    data: {
      debtId: params.payableDebtId,
      amount: params.rebateAmount,
      type: params.rebateType,
      createdBy: params.userId,
    },
  });

  const receivable = await tx.debt.create({
    data: {
      tenantId: params.tenantId,
      branchId: params.branchId,
      supplierId: params.supplierId,
      direction: 'RECEIVABLE',
      debtType: 'CASH',
      source: params.source,
      amount: params.rebateAmount,
      remainingAmount: 0,
      status: 'PAID',
      paidAt: new Date(),
      category: params.rebateType,
      relatedDebtId: params.payableDebtId,
      createdBy: params.userId,
      notes: `${REBATE_LABELS[params.rebateType]} — fatura borcuna karşılık otomatik mahsup edildi`,
    },
    select: { id: true },
  });

  return { receivableDebtId: receivable.id };
}
