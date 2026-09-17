'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/store/auth.store';
import {
  useSupplierLedger,
  useCreateLedgerEntry,
  type SupplierLedgerEntryItem,
  type SupplierLedgerMonth,
} from '@/hooks/useMudur';

function fmtAmount(amount: string | number) {
  return `${Number(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

function fmtDateTime(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateStr));
}

const MONTH_LABELS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function entryTypeLabel(type: string): string {
  if (type === 'INVOICE') return 'Fatura';
  if (type === 'PAYMENT') return 'Ödeme';
  if (type === 'CIRO_PRIMI') return 'Ciro Primi Tahsilatı';
  if (type === 'FIRMA_GERI_ODEMESI') return 'Firma Geri Ödemesi';
  if (type === 'IADE_FATURASI') return 'İade Faturası';
  return type;
}

function isReducingEntry(type: string): boolean {
  return type === 'PAYMENT' || type === 'CIRO_PRIMI' || type === 'FIRMA_GERI_ODEMESI' || type === 'IADE_FATURASI';
}

function EntryRow({ entry, showLabel = true }: { entry: SupplierLedgerEntryItem; showLabel?: boolean }) {
  const negative = isReducingEntry(entry.type);
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
      {showLabel && <p className="text-xs text-muted-foreground">{entryTypeLabel(entry.type)}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{fmtDateTime(entry.createdAt)}</span>
        <span className="font-medium">
          {negative ? '-' : ''}
          {fmtAmount(entry.amount)}
        </span>
      </div>
    </div>
  );
}

function SupplierLedgerInner() {
  const searchParams = useSearchParams();
  const supplierId = searchParams.get('supplierId') ?? '';
  const { user } = useAuthStore();
  const branchId = searchParams.get('branchId') ?? user?.branchId ?? '';

  const { data: ledger, isPending, isError } = useSupplierLedger(branchId, supplierId);
  const createEntry = useCreateLedgerEntry(branchId, supplierId);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [rebateAmount, setRebateAmount] = useState('');
  const [rebateType, setRebateType] = useState<'CIRO_PRIMI' | 'FIRMA_GERI_ODEMESI'>('CIRO_PRIMI');

  function handlePayment() {
    const amount = Number(paymentAmount.replace(',', '.'));
    if (!amount || amount <= 0) return;
    createEntry.mutate({ type: 'PAYMENT', amount }, { onSuccess: () => setPaymentAmount('') });
  }

  function handleRebate() {
    const amount = Number(rebateAmount.replace(',', '.'));
    if (!amount || amount <= 0) return;
    createEntry.mutate({ type: rebateType, amount }, { onSuccess: () => setRebateAmount('') });
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Tedarikçi Bakiyesi" />

      {isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">Bakiye yüklenirken hata oluştu.</p>
        </div>
      )}

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : !ledger ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">Kayıt bulunamadı.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. Başlık — tedarikçi adı + güncel bakiye */}
          <div>
            <p className="text-sm text-muted-foreground">{ledger.supplierName}</p>
            <p
              className={`text-3xl font-bold ${ledger.balance < 0 ? 'text-red-600' : ''}`}
            >
              {ledger.balance < 0 ? '-' : ''}
              {fmtAmount(Math.abs(ledger.balance))}
            </p>
          </div>

          {/* 2. Yapılan ödeme */}
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Yapılan Ödeme Tutarı</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0,00"
                className="h-11 flex-1"
              />
              <Button
                className="h-11"
                disabled={createEntry.isPending || !paymentAmount.trim()}
                onClick={handlePayment}
              >
                Kaydet
              </Button>
            </div>
          </div>

          {/* 3. Ciro primi / firma geri ödemesi */}
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Ciro Primi / Geri Ödeme</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={rebateType === 'CIRO_PRIMI' ? 'default' : 'outline'}
                onClick={() => setRebateType('CIRO_PRIMI')}
              >
                Ciro Primi Tahsilatı
              </Button>
              <Button
                type="button"
                variant={rebateType === 'FIRMA_GERI_ODEMESI' ? 'default' : 'outline'}
                onClick={() => setRebateType('FIRMA_GERI_ODEMESI')}
              >
                Firma Geri Ödemesi
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={rebateAmount}
                onChange={(e) => setRebateAmount(e.target.value)}
                placeholder="0,00"
                className="h-11 flex-1"
              />
              <Button
                className="h-11"
                disabled={createEntry.isPending || !rebateAmount.trim()}
                onClick={handleRebate}
              >
                Kaydet
              </Button>
            </div>
          </div>

          {/* 4. Son 5 ciro primi/geri ödeme */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Son 5 Ciro Primi/Geri Ödeme</p>
            {ledger.recentRebates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Kayıt yok.</p>
            ) : (
              <div className="space-y-1">
                {ledger.recentRebates.map((entry: SupplierLedgerEntryItem) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>

          {/* 5. Son 5 iade faturası */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Son 5 İade Faturası</p>
            {ledger.recentReturns.length === 0 ? (
              <p className="text-sm text-muted-foreground">Kayıt yok.</p>
            ) : (
              <div className="space-y-1">
                {ledger.recentReturns.map((entry: SupplierLedgerEntryItem) => (
                  <EntryRow key={entry.id} entry={entry} showLabel={false} />
                ))}
              </div>
            )}
          </div>

          {/* 6. Son 4 ay özeti */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Son 4 Ay</p>
            {ledger.monthlyBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">Veri yok.</p>
            ) : (
              <div className="space-y-2">
                {ledger.monthlyBreakdown.map((m: SupplierLedgerMonth) => (
                  <div key={`${m.year}-${m.month}`} className="rounded-md border px-3 py-2 text-sm">
                    <p className="mb-1 font-medium">
                      {MONTH_LABELS[m.month - 1]} {m.year}
                    </p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Fatura: {fmtAmount(m.invoiceTotal)}</span>
                      <span>Ödeme: {fmtAmount(m.paymentTotal)}</span>
                      <span>Ciro Primi/Geri Ödeme: {fmtAmount(m.rebateTotal)}</span>
                      <span>İade: {fmtAmount(m.returnTotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 7. Genel hareket geçmişi */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Hareketler</p>
            {ledger.recentEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz hareket yok.</p>
            ) : (
              <div className="space-y-1">
                {ledger.recentEntries.map((entry: SupplierLedgerEntryItem) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupplierLedgerPage() {
  return (
    <Suspense>
      <SupplierLedgerInner />
    </Suspense>
  );
}
