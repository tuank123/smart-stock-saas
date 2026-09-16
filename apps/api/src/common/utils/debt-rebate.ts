import { Prisma } from '@prisma/client';

export type RebateType = 'CIRO_PRIMI' | 'FIRMA_GERI_ODEMESI';

/**
 * OCR fatura onayı (ocr.service.ts) ve manuel borç girişi (debts.service.ts)
 * arasında paylaşılan tek mantık: bir PAYABLE/CASH borç oluşturulurken
 * tedarikçinin bildirdiği bir ciro primi/firma geri ödemesi HEMEN mahsup
 * edilmişse, bunu o borcun ödeme geçmişinde (DebtPayment) görünür kılar —
 * recordCashPayment'ın dayandığı "remainingAmount + Σpayments == amount"
 * bütünlük değişmezini bozmadan.
 *
 * NOT (manuel test sonrası karar): önceden burada AYRICA relatedDebtId ile
 * PAYABLE'a bağlı, zaten kapanmış ayrı bir RECEIVABLE borç da oluşturuluyordu
 * — bu kaldırıldı. Ciro primi/geri ödeme görünürlüğü artık TAMAMEN PAYABLE
 * borcun kendi tarafında yaşıyor (category alanı + bu DebtPayment satırı) —
 * ayrı bir Alacaklar sekmesi kaydı YOK.
 *
 * ÇAĞIRANIN SORUMLULUĞU: PAYABLE borcun kendisi (amount/remainingAmount/
 * category) bu fonksiyon çağrılmadan ÖNCE, kendi create() çağrısında zaten
 * rebateAmount düşülerek oluşturulmuş olmalı — bu fonksiyon yalnızca REVİZE
 * EDİLMİŞ o borcun ID'sini alır, kendisi remainingAmount'a dokunmaz.
 */
export async function createRebateRecords(
  tx: Prisma.TransactionClient,
  params: {
    payableDebtId: string;
    rebateAmount: number;
    rebateType: RebateType;
    userId: string;
  },
): Promise<void> {
  await tx.debtPayment.create({
    data: {
      debtId: params.payableDebtId,
      amount: params.rebateAmount,
      type: params.rebateType,
      createdBy: params.userId,
    },
  });
}
