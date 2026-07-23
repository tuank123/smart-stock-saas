'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle, Pencil, RefreshCw, XCircle } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  useDraftOrders,
  useApproveOrder,
  useCancelOrder,
  useStockList,
} from '@/hooks/useMudur';
import type { Order, StockLevel } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short' }).format(new Date(dateStr));
}

function DraftCardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex justify-between">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-3 w-48" />
      <div className="flex gap-2">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 flex-1" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SiparisOnerileriPage() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();

  const { data: drafts, isPending: draftsLoading, isError: draftsError } = useDraftOrders();
  const stockQuery = useStockList();
  const approveMutation = useApproveOrder();
  const cancelMutation = useCancelOrder();
  const mutationBusy = approveMutation.isPending || cancelMutation.isPending;

  // productId → güncel stok kaydı (kalan miktarı satırda göstermek için).
  const stockByProduct = useMemo(() => {
    const map = new Map<string, StockLevel>();
    (stockQuery.data ?? []).forEach((s: StockLevel) => map.set(s.productId, s));
    return map;
  }, [stockQuery.data]);

  // Tek şubeli işletme: tüm tenant tek şube olduğundan branchId göndermeye gerek yok.
  const checkMutation = useMutation({
    mutationFn: () => api.post('/orders/check-thresholds', {}).then((r) => r.data),
    onSuccess: (data: { createdOrders: number }) => {
      qc.invalidateQueries({ queryKey: ['orders', 'draft', branchId] });
      toast.success(`${data.createdOrders} yeni taslak sipariş oluşturuldu`);
    },
    onError: () => toast.error('Eşik kontrolü başarısız'),
  });

  return (
    <div>
      <StationPageHeader title="Sipariş Önerileri" />

      {/* Eşik kontrolü */}
      <div className="mb-4">
        <Button
          className="w-full gap-1.5"
          onClick={() => checkMutation.mutate()}
          disabled={checkMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 ${checkMutation.isPending ? 'animate-spin' : ''}`} />
          {checkMutation.isPending ? 'Kontrol ediliyor…' : 'Eşik Kontrolü Yap'}
        </Button>
      </div>

      {draftsError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">Siparişler yüklenirken hata oluştu.</p>
        </div>
      )}

      {draftsLoading ? (
        <div className="space-y-3">
          <DraftCardSkeleton />
          <DraftCardSkeleton />
          <DraftCardSkeleton />
        </div>
      ) : (drafts?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
          <CheckCircle className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Onay bekleyen sipariş yok.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(drafts ?? []).map((order: Order) => (
            <Card key={order.id}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <p className="font-semibold">{order.supplier.name}</p>
                    <div className="space-y-2">
                      {order.items.map((item) => {
                        const stock = stockByProduct.get(item.productId);
                        const unit = item.product.unit;
                        const ordered = Number(item.quantityOrdered).toLocaleString('tr-TR');
                        return (
                          <div key={item.id}>
                            <p className="text-sm font-medium leading-tight">{item.product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {stock != null && (
                                <>Kalan: {Number(stock.quantity).toLocaleString('tr-TR')} {unit} · </>
                              )}
                              Önerilen: {ordered} {unit}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    <p className="pt-0.5 text-xs text-muted-foreground">{fmt(order.createdAt)}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                      disabled={mutationBusy}
                      onClick={() => approveMutation.mutate(order.id)}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Onayla
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={mutationBusy} asChild>
                      <Link href={`/isletme-app/siparis-onerileri/duzenle?orderId=${order.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                        Düzenle
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                      disabled={mutationBusy}
                      onClick={() => cancelMutation.mutate(order.id)}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      İptal
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
