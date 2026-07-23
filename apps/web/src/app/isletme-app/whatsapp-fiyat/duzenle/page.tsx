'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileWarning } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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

// Düzenleme sırasında: mesajdan gelen sabit liste fiyatı (originalListPrice) +
// fiyat input'unun ham metni (priceText). newPrice hâlâ payload/hesap için sayısal.
interface EditItem extends ParsedPriceItem {
  originalListPrice: number;
  priceText: string;
}

// ── Inner content — needs useSearchParams so wrapped in Suspense ──────────────

function PriceUploadEditInner() {
  const searchParams = useSearchParams();
  const uploadId = searchParams.get('uploadId') ?? '';
  const router = useRouter();

  const { data: upload, isPending, isError } = usePriceUploadDetail(uploadId);
  const updateItems = useUpdatePriceItems();
  const approveUpload = useApprovePriceUpload();

  const [items, setItems] = useState<EditItem[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Yalnız ilk yüklemede doldur — originalListPrice bir daha değişmesin
  // (kaydet sonrası refetch bu değeri sıfırlamasın).
  useEffect(() => {
    if (upload?.parsedItems && !initialized) {
      setItems(
        upload.parsedItems.map((i: ParsedPriceItem) => ({
          ...i,
          originalListPrice: i.newPrice, // mesajdan gelen sabit fiyat
          priceText: String(i.newPrice),
        })),
      );
      setInitialized(true);
    }
  }, [upload, initialized]);

  function updateItem(productId: string, patch: Partial<EditItem>) {
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
      approveUpload.mutate(uploadId, { onSuccess: () => router.push('/isletme-app/whatsapp-fiyat') });
    });
  }

  const busy = updateItems.isPending || approveUpload.isPending;

  return (
    <div>
      <StationPageHeader title="Fiyat Listesi Düzenle" />

      {isError && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Yükleme yüklenirken hata oluştu.
        </div>
      )}

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-md" />
          <Skeleton className="h-28 w-full rounded-md" />
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
          {/* Mobil dikey kartlar — her ürün için tam genişlik input'lar */}
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.productId} className="rounded-md border p-3">
                <p className="text-sm font-medium leading-tight">{item.productName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Eski fiyat: {fmtMoney(item.oldPrice)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Güncel Liste Fiyatı: {fmtMoney(item.originalListPrice)}
                </p>

                <div className="mt-3 space-y-1.5">
                  <Label htmlFor={`price-${item.productId}`}>Şubenizin Satış Fiyatı (₺)</Label>
                  <Input
                    id={`price-${item.productId}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.priceText}
                    onChange={(e) => {
                      const text = e.target.value;
                      const v = Number(text);
                      updateItem(item.productId, {
                        priceText: text, // ham metni her zaman koru (boş dahil)
                        // yalnız geçerli sayıda newPrice'ı güncelle; aksi halde son geçerli değer kalsın
                        ...(text.trim() !== '' && !isNaN(v) && v >= 0 ? { newPrice: v } : {}),
                      });
                    }}
                    className="w-full text-sm"
                  />
                </div>

                <div className="mt-3 space-y-1.5">
                  <Label htmlFor={`disc-${item.productId}`}>İndirim %</Label>
                  <Input
                    id={`disc-${item.productId}`}
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
                    className="w-full text-sm"
                  />
                </div>

                <p className="mt-3 text-sm">
                  Belirlenen Satış Fiyatı:{' '}
                  <span className="font-medium">
                    {fmtMoney(finalPrice(item.newPrice, item.discountPct))}
                  </span>
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-2">
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => handleSave()}>
              Kaydet
            </Button>
            <Button className="flex-1" disabled={busy} onClick={handleApproveAll}>
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
