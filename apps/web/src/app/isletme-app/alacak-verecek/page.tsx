'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Plus, Wallet } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebts, useMarkDebtsViewed, type Debt } from '@/hooks/useMudur';

type Tab = 'PAYABLE' | 'RECEIVABLE';

interface SupplierDebtGroup {
  supplierId: string;
  supplierName: string;
  debts: Debt[];
}

function fmtAmount(amount: string) {
  return `${Number(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

function fmtDate(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(dateStr));
}

// Bir grubun OPEN CASH borçlarının kalan tutarları toplamı (PAID olanlar,
// 3 günlük görünürlük penceresinde bile olsa, zaten kapanmış — dahil edilmez).
function openCashTotal(debts: Debt[]): number {
  return debts
    .filter((d) => d.debtType === 'CASH' && d.status === 'OPEN')
    .reduce((sum, d) => sum + Number(d.remainingAmount ?? d.amount ?? 0), 0);
}

// Bir grubun OPEN PRODUCT borçlarında henüz tam teslim alınmamış kalem sayısı.
function pendingProductLineCount(debts: Debt[]): number {
  return debts
    .filter((d) => d.debtType === 'PRODUCT' && d.status === 'OPEN')
    .reduce(
      (sum, d) =>
        sum + (d.productLines ?? []).filter((l) => l.receivedQuantity < l.quantity).length,
      0,
    );
}

// ── Grup içindeki tek bir fatura/borç satırı ───────────────────────────────────

function DebtRow({ debt, onClick }: { debt: Debt; onClick: () => void }) {
  // CASH: kalan tutar (varsa), yoksa orijinal amount.
  const remaining = debt.remainingAmount ?? debt.amount;
  const showTotal =
    debt.remainingAmount != null && debt.amount != null && debt.remainingAmount !== debt.amount;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      className="cursor-pointer space-y-2 p-3 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{fmtDate(debt.createdAt)}</p>
          {debt.debtType === 'CASH' ? (
            <>
              <p className="text-lg font-bold">
                {remaining != null ? fmtAmount(remaining) : '—'}
              </p>
              {showTotal && debt.amount != null && (
                <p className="text-xs text-muted-foreground">Toplam: {fmtAmount(debt.amount)}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm">{debt.productDescription ?? '—'}</p>
              {(debt.productLines ?? []).length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {(debt.productLines ?? []).map((l) => (
                    <p key={l.productId} className="text-xs text-muted-foreground">
                      {l.productName}: {l.receivedQuantity}/{l.quantity} {l.unit}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {debt.status === 'OPEN' ? (
            <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
              Açık
            </Badge>
          ) : (
            <Badge className="border-green-200 bg-green-100 text-green-800 hover:bg-green-100">
              Ödendi
            </Badge>
          )}
          {debt.debtType === 'PRODUCT' && (
            <Badge
              variant="outline"
              className="border-blue-200 bg-blue-100 text-blue-800 hover:bg-blue-100"
            >
              Ürün
            </Badge>
          )}
          {debt.source === 'OCR' && (
            <Badge
              variant="outline"
              className="border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100"
            >
              OCR
            </Badge>
          )}
        </div>
      </div>

      {debt.dueDate && <p className="text-xs text-muted-foreground">Vade: {fmtDate(debt.dueDate)}</p>}

      {debt.notes && <p className="text-sm text-muted-foreground">{debt.notes}</p>}
    </div>
  );
}

// ── Tedarikçi/müşteri başına TEK kart — altında tüm faturaları listeler ────────

function SupplierDebtGroupCard({ group, onOpenDebt }: { group: SupplierDebtGroup; onOpenDebt: (debtId: string) => void }) {
  const cashTotal = openCashTotal(group.debts);
  const pendingLines = pendingProductLineCount(group.debts);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="truncate font-semibold">{group.supplierName}</p>
          <div className="mt-0.5 space-y-0.5">
            {cashTotal > 0 && <p className="text-lg font-bold">Toplam: {fmtAmount(String(cashTotal))}</p>}
            {pendingLines > 0 && (
              <p className="text-sm text-muted-foreground">{pendingLines} ürün kalemi bekliyor</p>
            )}
            {cashTotal === 0 && pendingLines === 0 && (
              <p className="text-sm text-muted-foreground">Açık kaydı yok</p>
            )}
          </div>
        </div>

        <div className="divide-y rounded-md border">
          {group.debts.map((debt) => (
            <DebtRow key={debt.id} debt={debt} onClick={() => onOpenDebt(debt.id)} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AlacakVerecekInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: debts, isPending, isError } = useDebts();
  const markViewed = useMarkDebtsViewed();

  // Aktif sekme URL query param'ıyla senkron (?tab=PAYABLE | RECEIVABLE).
  const initialTab: Tab = searchParams.get('tab') === 'RECEIVABLE' ? 'RECEIVABLE' : 'PAYABLE';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState('');

  function selectTab(next: Tab) {
    setTab(next);
    router.replace(`/isletme-app/alacak-verecek?tab=${next}`);
  }

  // Bu bölüme girildiğinde "görüldü" işaretle → 2 gün ziyaret sayacı sıfırlanır.
  useEffect(() => {
    markViewed.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return (debts ?? []).filter(
      (d: Debt) =>
        d.direction === tab &&
        (q === '' || d.supplier.name.toLocaleLowerCase('tr-TR').includes(q)),
    );
  }, [debts, tab, search]);

  // supplierId'ye göre grupla — backend zaten createdAt desc döndürdüğü için
  // Map'in ilk-görülme sırası "en son hareketi olan tedarikçi en üstte" verir.
  const groups = useMemo<SupplierDebtGroup[]>(() => {
    const bySupplier = new Map<string, SupplierDebtGroup>();
    for (const debt of filtered) {
      const existing = bySupplier.get(debt.supplierId);
      if (existing) {
        existing.debts.push(debt);
      } else {
        bySupplier.set(debt.supplierId, {
          supplierId: debt.supplierId,
          supplierName: debt.supplier.name,
          debts: [debt],
        });
      }
    }
    return Array.from(bySupplier.values());
  }, [filtered]);

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader
        title="Alacak Verecek Listeleri"
        right={
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" asChild>
            <Link href="/isletme-app/alacak-verecek/yeni">
              <Plus className="h-4 w-4" />
              Yeni Kayıt
            </Link>
          </Button>
        }
      />

      {/* Filtre sekmeleri */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button
          variant={tab === 'PAYABLE' ? 'default' : 'outline'}
          onClick={() => selectTab('PAYABLE')}
        >
          Verecekler
        </Button>
        <Button
          variant={tab === 'RECEIVABLE' ? 'default' : 'outline'}
          onClick={() => selectTab('RECEIVABLE')}
        >
          Alacaklar
        </Button>
      </div>

      {/* Firma adına göre arama */}
      <div className="mb-4">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Firma adına göre ara…"
          className="w-full"
        />
      </div>

      {isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">Kayıtlar yüklenirken hata oluştu.</p>
        </div>
      )}

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
          <Wallet className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Henüz kayıt yok.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <SupplierDebtGroupCard
              key={group.supplierId}
              group={group}
              onOpenDebt={(debtId) =>
                router.push(`/isletme-app/alacak-verecek/detay?debtId=${debtId}`)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AlacakVerecekPage() {
  return (
    <Suspense>
      <AlacakVerecekInner />
    </Suspense>
  );
}
