'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle, Plus, Wallet } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebts, useMarkDebtsViewed, useUpdateDebt, type Debt } from '@/hooks/useMudur';

type Tab = 'PAYABLE' | 'RECEIVABLE';

function fmtAmount(amount: string) {
  return `${Number(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

function fmtDate(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(dateStr));
}

export default function AlacakVerecekPage() {
  const { data: debts, isPending, isError } = useDebts();
  const markViewed = useMarkDebtsViewed();
  const updateDebt = useUpdateDebt();

  const [tab, setTab] = useState<Tab>('PAYABLE');
  const [search, setSearch] = useState('');

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

  function handleMarkPaid(debtId: string) {
    updateDebt.mutate({ debtId, data: { status: 'PAID' } });
  }

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
          onClick={() => setTab('PAYABLE')}
        >
          Verecekler
        </Button>
        <Button
          variant={tab === 'RECEIVABLE' ? 'default' : 'outline'}
          onClick={() => setTab('RECEIVABLE')}
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
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
          <Wallet className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Henüz kayıt yok.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((debt: Debt) => (
            <Card key={debt.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{debt.supplier.name}</p>
                    {debt.debtType === 'CASH' ? (
                      <p className="text-lg font-bold">
                        {debt.amount != null ? fmtAmount(debt.amount) : '—'}
                      </p>
                    ) : (
                      <p className="text-sm">{debt.productDescription ?? '—'}</p>
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

                {debt.dueDate && (
                  <p className="text-xs text-muted-foreground">Vade: {fmtDate(debt.dueDate)}</p>
                )}

                {debt.notes && <p className="text-sm text-muted-foreground">{debt.notes}</p>}

                {debt.status === 'OPEN' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                    disabled={updateDebt.isPending}
                    onClick={() => handleMarkPaid(debt.id)}
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Ödendi Olarak İşaretle
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
