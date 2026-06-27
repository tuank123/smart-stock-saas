'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  usePriceUploadDetail,
  useUpdatePriceItems,
} from '@/hooks/useMudur';
import type { ParsedPriceItem } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(val: number | null) {
  if (val == null) return '—';
  return `${val.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`;
}

function finalPrice(newPrice: number, discountPct: number | null) {
  return newPrice * (1 - (discountPct ?? 0) / 100);
}

// ── Inner content — needs useSearchParams so wrapped in Suspense ──────────────

function PriceUploadEditInner() {
  const searchParams = useSearchParams();
  const uploadId = searchParams.get('uploadId') ?? '';
  const router = useRouter();

  const { data: upload, isPending, isError } = usePriceUploadDetail(uploadId);
  const updateItems = useUpdatePriceItems();
  const approveUpload = useApprovePriceUpload();

  const [items, setItems] = useState<ParsedPriceItem[]>([]);

  useEffect(() => {
    if (upload?.parsedItems) setItems(upload.parsedItems);
  }, [upload]);

  function updateItem(productId: string, patch: Partial<ParsedPriceItem>) {
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, ...patch } : i)));
  }

  function handleSave(onSuccess?: () => void) {
    updateItems.mutate(
      {
        uploadId,
        items: items.map((i) => ({
          productId: i.productId,
          newPrice: i.newPrice,
          discountPct: i.discountPct ?? undefined,
        })),
      },
      { onSuccess },
    );
  }

  function handleApproveAll() {
    handleSave(() => {
      approveUpload.mutate(uploadId, { onSuccess: () => router.push('/mudur/fiyat-guncelleme') });
    });
  }

  const supplierName = upload?.supplier?.name ?? upload?.ocrExtractedFirm ?? 'Bilinmeyen Tedarikçi';
  const busy = updateItems.isPending || approveUpload.isPending;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/mudur/fiyat-guncelleme">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Fiyat Listesi Düzenle</h1>
          {upload && <p className="text-xs text-muted-foreground">{supplierName}</p>}
        </div>
      </div>

      {isError && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Yükleme yüklenirken hata oluştu.
        </div>
      )}

      {isPending ? (
        <div className="rounded-xl border bg-card p-4">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileWarning className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Henüz ürün listesi yüklenmedi.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün Adı</TableHead>
                  <TableHead>Eski Fiyat</TableHead>
                  <TableHead>Yeni Liste Fiyatı</TableHead>
                  <TableHead>İndirim %</TableHead>
                  <TableHead>Final Fiyat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.productId}>
                    <TableCell className="font-medium">{item.productName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtMoney(item.oldPrice)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.newPrice}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v >= 0) updateItem(item.productId, { newPrice: v });
                        }}
                        className="h-8 w-28 text-right text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={item.discountPct ?? ''}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          updateItem(item.productId, {
                            discountPct: !isNaN(v) && v >= 0 && v <= 100 ? v : null,
                          });
                        }}
                        className="h-8 w-20 text-right text-sm"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {fmtMoney(finalPrice(item.newPrice, item.discountPct))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => handleSave()}>
              Kaydet
            </Button>
            <Button disabled={busy} onClick={handleApproveAll}>
              Tümünü Onayla
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Page export — wrap in Suspense for useSearchParams ────────────────────────

export default function PriceUploadEditPage() {
  return (
    <Suspense>
      <PriceUploadEditInner />
    </Suspense>
  );
}
