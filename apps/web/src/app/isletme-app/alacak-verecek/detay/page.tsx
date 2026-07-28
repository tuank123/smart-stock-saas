'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDebts,
  useRecordCashPayment,
  useRecordProductReceipt,
  type Debt,
} from '@/hooks/useMudur';

function fmtAmount(amount: string) {
  return `${Number(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

function fmtDate(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(new Date(dateStr));
}

function fmtDateTime(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateStr));
}

// ── CASH detayı ────────────────────────────────────────────────────────────────

function CashDetail({ debt }: { debt: Debt }) {
  const recordCash = useRecordCashPayment();
  const [amount, setAmount] = useState('');

  const remaining = debt.remainingAmount ?? debt.amount;
  const remainingNum = remaining != null ? Number(remaining) : 0;
  const showTotal =
    debt.remainingAmount != null &&
    debt.amount != null &&
    debt.remainingAmount !== debt.amount;

  const enteredNum = Number(amount.replace(',', '.'));
  const overpay = !!amount.trim() && enteredNum > remainingNum;

  function handlePay() {
    if (!enteredNum || enteredNum <= 0) return;
    recordCash.mutate({ id: debt.id, amount: enteredNum }, { onSuccess: () => setAmount('') });
  }

  // En yeni en üstte olacak şekilde ödeme geçmişi.
  const paymentsDesc = [...(debt.payments ?? [])].reverse();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Kalan Tutar</p>
        <p className="text-2xl font-bold">{remaining != null ? fmtAmount(remaining) : '—'}</p>
        {showTotal && debt.amount != null && (
          <p className="text-sm text-muted-foreground">Toplam: {fmtAmount(debt.amount)}</p>
        )}
      </div>

      {/* Ödeme Geçmişi */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Ödeme Geçmişi</p>
        {paymentsDesc.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz ödeme yapılmadı.</p>
        ) : (
          <div className="space-y-1">
            {paymentsDesc.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">{fmtDateTime(p.paidAt)}</span>
                <span className="font-medium">{fmtAmount(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {debt.status === 'PAID' ? (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Bu borç ödendi.
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="pay-amount">Yapılacak Ödeme Tutarı (₺)</Label>
          <Input
            id="pay-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
          {overpay && (
            <p className="flex items-center gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Girilen tutar kalan borçtan fazla — kalan sıfırlanacak.
            </p>
          )}
          <Button
            className="h-11 w-full"
            disabled={recordCash.isPending || !amount.trim()}
            onClick={handlePay}
          >
            {recordCash.isPending ? 'Kaydediliyor…' : 'Ödemeyi Kaydet'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── PRODUCT detayı ───────────────────────────────────────────────────────────

function ProductDetail({ debt }: { debt: Debt }) {
  const recordReceipt = useRecordProductReceipt();
  // productId → bu kez teslim alınan (ham string)
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const lines = debt.productLines ?? [];

  function handleSave() {
    const payload = lines
      .map((l) => {
        const raw = inputs[l.productId];
        const val = raw ? Number(raw.replace(',', '.')) : 0;
        return { productId: l.productId, receivedQuantity: val };
      })
      .filter((l) => l.receivedQuantity > 0);
    if (payload.length === 0) return;
    recordReceipt.mutate({ id: debt.id, lines: payload }, { onSuccess: () => setInputs({}) });
  }

  return (
    <div className="space-y-4">
      {debt.status === 'PAID' && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Tüm ürünler teslim alındı.
        </div>
      )}

      {lines.length === 0 && (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          Bu kayıt için ürün detayı bulunamadı.
        </p>
      )}

      <div className="space-y-3">
        {lines.map((l) => {
          const received = l.receivedQuantity ?? 0;
          const remaining = l.quantity - received;
          return (
            <div key={l.productId} className="space-y-1.5 rounded-lg border p-3">
              <p className="font-medium">{l.productName}</p>
              <p className="text-xs text-muted-foreground">
                Toplam: {l.quantity} {l.unit} · Teslim Alınan: {received} {l.unit}
              </p>
              {debt.status === 'OPEN' && remaining > 0 && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max={remaining}
                    step="0.001"
                    value={inputs[l.productId] ?? ''}
                    onChange={(e) =>
                      setInputs((prev) => ({ ...prev, [l.productId]: e.target.value }))
                    }
                    placeholder={`Bu kez (max ${remaining})`}
                    className="h-9 flex-1"
                  />
                  <span className="text-xs text-muted-foreground">{l.unit}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {debt.status === 'OPEN' && (
        <Button
          className="h-11 w-full"
          disabled={recordReceipt.isPending}
          onClick={handleSave}
        >
          {recordReceipt.isPending ? 'Kaydediliyor…' : 'Teslim Almayı Kaydet'}
        </Button>
      )}
    </div>
  );
}

// ── Inner (Suspense içinde) ───────────────────────────────────────────────────

function DebtDetailInner() {
  const searchParams = useSearchParams();
  const debtId = searchParams.get('debtId') ?? '';
  const { data: debts, isPending, isError } = useDebts();

  const debt = (debts ?? []).find((d: Debt) => d.id === debtId);

  const primaryDate = debt?.dueDate ?? debt?.createdAt ?? null;

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Detay" />

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : isError || !debt ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">Kayıt bulunamadı.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Tarih — normal boyut/ağırlık */}
          {primaryDate && <p className="text-sm text-muted-foreground">{fmtDate(primaryDate)}</p>}

          {/* Tedarikçi + rozetler */}
          <div className="space-y-2">
            <p className="text-lg font-semibold">{debt.supplier.name}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline">
                {debt.direction === 'PAYABLE'
                  ? 'İşletme Tedarikçiye Borçlu'
                  : 'Tedarikçi İşletmeye Borçlu'}
              </Badge>
              <Badge variant="outline">{debt.debtType === 'CASH' ? 'Nakit' : 'Ürün'}</Badge>
            </div>
          </div>

          {debt.debtType === 'CASH' ? (
            <CashDetail debt={debt} />
          ) : (
            <ProductDetail debt={debt} />
          )}

          {debt.notes && (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {debt.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function DebtDetailPage() {
  return (
    <Suspense>
      <DebtDetailInner />
    </Suspense>
  );
}
