'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useStockDetail,
  useStockMovements,
  useUpdateThreshold,
  type StockMovement,
} from '@/hooks/useMudur';

// ── Movement badge ────────────────────────────────────────────────────────────

const MOVEMENT_CONFIG: Record<string, { label: string; className: string }> = {
  IN: {
    label: 'Giriş',
    className: 'border-green-200 bg-green-50 text-green-700',
  },
  OUT: {
    label: 'Çıkış',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
  WASTE: {
    label: 'Fire',
    className: 'border-orange-200 bg-orange-50 text-orange-700',
  },
  TRANSFER_IN: {
    label: 'Transfer Giriş',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  TRANSFER_OUT: {
    label: 'Transfer Çıkış',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  ADJUSTMENT: {
    label: 'Düzeltme',
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  },
};

function MovementBadge({ type }: { type: string }) {
  const cfg = MOVEMENT_CONFIG[type];
  if (!cfg) {
    return (
      <Badge variant="outline" className="text-xs">
        {type}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={`text-xs ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

// ── Skeleton helpers ──────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
      </CardContent>
    </Card>
  );
}

// ── Inner content — needs useSearchParams so wrapped in Suspense ──────────────

function StockDetailInner() {
  const searchParams = useSearchParams();
  const productId = searchParams.get('productId') ?? '';
  const router = useRouter();

  const detailQuery = useStockDetail(productId);
  const movementsQuery = useStockMovements();
  const updateThreshold = useUpdateThreshold();

  const [minThreshold, setMinThreshold] = useState('');
  const [maxThreshold, setMaxThreshold] = useState('');
  const [thresholdDirty, setThresholdDirty] = useState(false);

  useEffect(() => {
    if (detailQuery.data && !thresholdDirty) {
      setMinThreshold(String(detailQuery.data.minThreshold ?? '0'));
      setMaxThreshold(String(detailQuery.data.maxThreshold ?? ''));
    }
  }, [detailQuery.isSuccess, thresholdDirty, detailQuery.data]);

  const productMovements: StockMovement[] = (movementsQuery.data ?? [])
    .filter((m: StockMovement) => m.productId === productId)
    .slice(0, 20);

  const stock = detailQuery.data;
  const isCritical = stock
    ? Number(stock.quantity) < Number(stock.minThreshold)
    : false;

  function handleThresholdSave() {
    const min = parseFloat(minThreshold);
    if (isNaN(min) || min < 0) return;
    const data: { minThreshold?: number; maxThreshold?: number } = {
      minThreshold: min,
    };
    const maxVal = parseFloat(maxThreshold);
    if (!isNaN(maxVal) && maxThreshold.trim() !== '') {
      data.maxThreshold = maxVal;
    }
    updateThreshold.mutate({ productId, data });
    setThresholdDirty(false);
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">
          {detailQuery.isPending ? (
            <Skeleton className="inline-block h-6 w-48" />
          ) : (
            stock?.product.name ?? 'Ürün Detayı'
          )}
        </h1>
      </div>

      {detailQuery.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">Ürün bilgisi yüklenemedi.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Ürün bilgileri */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Ürün Bilgileri
          </h2>
          {detailQuery.isPending ? (
            <DetailSkeleton />
          ) : stock ? (
            <Card>
              <CardContent className="p-6">
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">SKU</dt>
                    <dd className="font-mono font-medium">{stock.product.sku}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Birim</dt>
                    <dd className="font-medium">{stock.product.unit}</dd>
                  </div>
                  {stock.product.barcode && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Barkod</dt>
                      <dd className="font-mono text-xs">{stock.product.barcode}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 border-t pt-3">
                    <dt className="text-muted-foreground">Mevcut Miktar</dt>
                    <dd
                      className={`text-lg font-bold ${isCritical ? 'text-destructive' : 'text-foreground'}`}
                    >
                      {Number(stock.quantity).toLocaleString('tr-TR')} {stock.product.unit}
                    </dd>
                  </div>
                  {isCritical && (
                    <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Stok kritik seviyenin altında
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Eşik düzenle */}
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Eşik Değerleri
          </h2>
          {detailQuery.isPending ? (
            <DetailSkeleton />
          ) : (
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="minThreshold">Min Eşik *</Label>
                    <Input
                      id="minThreshold"
                      type="number"
                      min={0}
                      step="0.001"
                      value={minThreshold}
                      onChange={(e) => {
                        setMinThreshold(e.target.value);
                        setThresholdDirty(true);
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="maxThreshold">Max Eşik (opsiyonel)</Label>
                    <Input
                      id="maxThreshold"
                      type="number"
                      min={0}
                      step="0.001"
                      value={maxThreshold}
                      onChange={(e) => {
                        setMaxThreshold(e.target.value);
                        setThresholdDirty(true);
                      }}
                      placeholder="Sınırsız"
                    />
                  </div>
                  <Button
                    onClick={handleThresholdSave}
                    disabled={updateThreshold.isPending}
                    className="w-full"
                  >
                    {updateThreshold.isPending ? 'Kaydediliyor…' : 'Kaydet'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Hareket geçmişi */}
      <div className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Son Hareketler
        </h2>

        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">Tür</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                  Miktar
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Notlar</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {movementsQuery.isPending ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Skeleton className="ml-auto h-4 w-14" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                  </tr>
                ))
              ) : productMovements.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    Bu ürün için hareket kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                productMovements.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <MovementBadge type={m.movementType} />
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        Number(m.quantity) < 0 ? 'text-destructive' : 'text-green-700'
                      }`}
                    >
                      {Number(m.quantity) > 0 ? '+' : ''}
                      {Number(m.quantity).toLocaleString('tr-TR')}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {m.notes ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Intl.DateTimeFormat('tr-TR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(m.createdAt))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Page export — wrap in Suspense for useSearchParams ────────────────────────

export default function StockDetailPage() {
  return (
    <Suspense>
      <StockDetailInner />
    </Suspense>
  );
}
