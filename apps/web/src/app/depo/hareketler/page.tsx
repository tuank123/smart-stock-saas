'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, History, Loader2 } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useStockMovements } from '@/hooks/useMudur';
import type { StockMovement } from '@/hooks/useMudur';

const PAGE_SIZE = 50;

// movementType → Türkçe etiket. Tanınmayan tip olduğu gibi gösterilir.
const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE_IN: 'Satın Alma Girişi',
  OCR_IMPORT: 'Fatura Girişi',
  WASTE: 'Fire',
  TRANSFER_IN: 'Transfer Girişi',
  TRANSFER_OUT: 'Transfer Çıkışı',
};

function movementLabel(type: string): string {
  return MOVEMENT_LABELS[type] ?? type;
}

function fmt(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateStr));
}

export default function DepoHareketlerPage() {
  const [page, setPage] = useState(1);
  const { data, isPending, isError } = useStockMovements({ page, pageSize: PAGE_SIZE });

  const list = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Stok Hareketleri" />

      {isError && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Hareketler yüklenirken hata oluştu.
        </div>
      )}

      {isPending ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Yükleniyor…</span>
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-14 text-center">
          <History className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Hareket bulunamadı</p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((m: StockMovement) => {
            const qty = Number(m.quantity);
            const positive = qty >= 0;
            return (
              <Card key={m.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {movementLabel(m.movementType)} · {fmt(m.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={`text-lg font-semibold tabular-nums ${positive ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {positive ? '+' : ''}
                      {qty.toLocaleString('tr-TR')}
                    </span>
                    <span className="ml-1 text-xs text-muted-foreground">{m.product.unit}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Sayfalama — admin/errors ile aynı desen */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Sayfa {page}/{totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Önceki
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sonraki
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
