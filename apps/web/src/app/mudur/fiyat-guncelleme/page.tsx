'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle, History, Pencil, TrendingDown, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useApprovePriceUpload,
  usePendingPriceUploads,
  usePriceChanges,
  useRejectPriceUpload,
} from '@/hooks/useMudur';
import type { PendingPriceUpload, PriceChange } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(dateStr));
}

function fmtMoney(val: string | number) {
  return `${Number(val).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`;
}

function fmtPct(val: string | number) {
  const n = Number(val);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}%`;
}

function supplierName(upload: PendingPriceUpload) {
  return upload.supplier?.name ?? upload.ocrExtractedFirm ?? 'Bilinmeyen Tedarikçi';
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function UploadCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex shrink-0 gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MudurFiyatGuncellemePage() {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');

  const {
    data: uploads,
    isPending: uploadsLoading,
    isError: uploadsError,
  } = usePendingPriceUploads();
  const approveMutation = useApprovePriceUpload();
  const rejectMutation = useRejectPriceUpload();
  const mutationBusy = approveMutation.isPending || rejectMutation.isPending;

  const {
    data: priceChanges,
    isPending: priceChangesLoading,
    isError: priceChangesError,
  } = usePriceChanges();

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Fiyat Güncelleme</h1>

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
          Onay Bekleyenler
          {(uploads?.length ?? 0) > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
              {uploads!.length}
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
          Fiyat Geçmişi
        </button>
      </div>

      {/* ── Onay Bekleyenler ── */}
      {tab === 'pending' && (
        <div>
          {uploadsError && (
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              Fiyat güncellemeleri yüklenirken hata oluştu.
            </div>
          )}

          {uploadsLoading ? (
            <div className="space-y-3">
              <UploadCardSkeleton />
              <UploadCardSkeleton />
            </div>
          ) : (uploads?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
              <CheckCircle className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Onay bekleyen fiyat güncellemesi yok.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {(uploads ?? []).map((upload: PendingPriceUpload) => (
                <Card key={upload.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="font-semibold">{supplierName(upload)}</p>
                      <p className="text-xs text-muted-foreground">{fmt(upload.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5" asChild>
                        <Link href={`/mudur/fiyat-guncelleme/duzenle?uploadId=${upload.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                          Düzenle
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                        disabled={mutationBusy}
                        onClick={() => approveMutation.mutate(upload.id)}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Onayla
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                        disabled={mutationBusy}
                        onClick={() => rejectMutation.mutate(upload.id)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reddet
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Fiyat Geçmişi ── */}
      {tab === 'history' && (
        <div>
          {priceChangesError && (
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              Fiyat geçmişi yüklenirken hata oluştu.
            </div>
          )}

          {priceChangesLoading ? (
            <TableSkeleton />
          ) : (priceChanges?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
              <History className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Henüz fiyat değişikliği yok.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ürün Adı</TableHead>
                    <TableHead>Eski Fiyat</TableHead>
                    <TableHead className="w-8" />
                    <TableHead>Yeni Fiyat</TableHead>
                    <TableHead>Değişim</TableHead>
                    <TableHead>Anomali</TableHead>
                    <TableHead>Tarih</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(priceChanges ?? []).map((change: PriceChange) => {
                    const pct = Number(change.changePct);
                    return (
                      <TableRow key={change.id}>
                        <TableCell className="font-medium">{change.product.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {fmtMoney(change.oldPrice)}
                        </TableCell>
                        <TableCell>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </TableCell>
                        <TableCell className="font-medium">{fmtMoney(change.newPrice)}</TableCell>
                        <TableCell>
                          <span
                            className={`flex items-center gap-1 text-sm font-medium ${
                              pct <= 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {pct <= 0 && <TrendingDown className="h-3.5 w-3.5" />}
                            {fmtPct(pct)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {change.anomalyFlag && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-red-200 bg-red-100 text-xs text-red-700"
                            >
                              ⚠ Anomali
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {fmt(change.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
