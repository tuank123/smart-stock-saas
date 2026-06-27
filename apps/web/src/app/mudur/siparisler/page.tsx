'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle, Pencil, Plus, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useOrders,
  useDraftOrders,
  useApproveOrder,
  useCancelOrder,
} from '@/hooks/useMudur';
import type { Order } from '@/lib/types';

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Taslak', className: 'border-slate-200 bg-slate-100 text-slate-600' },
  APPROVED: { label: 'Onaylandı', className: 'border-blue-200 bg-blue-100 text-blue-700' },
  SENT: { label: 'Gönderildi', className: 'border-orange-200 bg-orange-100 text-orange-700' },
  RECEIVED: {
    label: 'Teslim Alındı',
    className: 'border-green-200 bg-green-100 text-green-700',
  },
  CANCELLED: { label: 'İptal', className: 'border-red-200 bg-red-100 text-red-700' },
};

function OrderStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status];
  if (!cfg)
    return (
      <Badge variant="outline" className="text-xs">
        {status}
      </Badge>
    );
  return (
    <Badge variant="outline" className={`text-xs ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcTotal(order: Order): number {
  return order.items.reduce((sum, item) => {
    return sum + Number(item.unitPrice ?? 0) * Number(item.quantityOrdered ?? 0);
  }, 0);
}

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

export default function MudurSiparislerPage() {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');

  const { data: drafts, isPending: draftsLoading, isError: draftsError } = useDraftOrders();
  const { data: allOrders, isPending: allLoading, isError: allError } = useOrders();
  const approveMutation = useApproveOrder();
  const cancelMutation = useCancelOrder();
  const mutationBusy = approveMutation.isPending || cancelMutation.isPending;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Siparişler</h1>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/mudur/siparisler/yeni">
            <Plus className="h-4 w-4" />
            Yeni Sipariş
          </Link>
        </Button>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex w-fit gap-1 rounded-lg border border-input bg-muted/30 p-1">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'pending'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Bekleyen Öneriler
          {(drafts?.length ?? 0) > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
              {drafts!.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'history'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Sipariş Geçmişi
        </button>
      </div>

      {/* ── Bekleyen Öneriler ── */}
      {tab === 'pending' && (
        <div>
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
              <p className="text-sm text-muted-foreground">Bekleyen sipariş önerisi yok.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(drafts ?? []).map((order: Order) => {
                const total = calcTotal(order);
                return (
                  <Card key={order.id}>
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <p className="font-semibold">{order.supplier.name}</p>
                          <ul className="space-y-0.5">
                            {order.items.map((item) => (
                              <li key={item.id} className="text-xs text-muted-foreground">
                                • {item.product.name} — {Number(item.quantityOrdered).toLocaleString('tr-TR')} {item.product.unit}
                              </li>
                            ))}
                          </ul>
                          <p className="pt-0.5 text-xs text-muted-foreground">{fmt(order.createdAt)}</p>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
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
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={mutationBusy}
                            asChild
                          >
                            <Link href={`/mudur/siparisler/duzenle?orderId=${order.id}`}>
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
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Sipariş Geçmişi ── */}
      {tab === 'history' && (
        <div>
          {allError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">Siparişler yüklenirken hata oluştu.</p>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground">Tedarikçi</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ürün</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Tutar</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Durum</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Tarih</th>
                </tr>
              </thead>
              <tbody>
                {allLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Skeleton className="ml-auto h-4 w-8" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Skeleton className="ml-auto h-4 w-16" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-5 w-20 rounded-full" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                    </tr>
                  ))
                ) : (allOrders?.length ?? 0) === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      Sipariş kaydı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  (allOrders ?? []).map((order: Order) => {
                    const total = calcTotal(order);
                    return (
                      <tr
                        key={order.id}
                        className="border-b last:border-0 transition-colors hover:bg-muted/30"
                      >
                        <td className="px-4 py-3 font-medium">{order.supplier.name}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {order.items.length}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {total > 0
                            ? `₺${total.toLocaleString('tr-TR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {fmt(order.createdAt)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
