'use client';

import Link from 'next/link';
import { AlertTriangle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDefectiveItems,
  useMarkDefectiveItemExchanged,
  useMarkDefectiveItemWasted,
  type DefectiveItemReport,
} from '@/hooks/useMudur';

function fmtDate(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(dateStr),
  );
}

export default function UrunZayiatiPage() {
  const { data: items, isPending, isError } = useDefectiveItems();
  const markWasted = useMarkDefectiveItemWasted();
  const markExchanged = useMarkDefectiveItemExchanged();

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader
        title="Ürün Zayiatları"
        right={
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" asChild>
            <Link href="/isletme-app/urun-zayiati/yeni">
              <Plus className="h-4 w-4" />
              Yeni Kayıt
            </Link>
          </Button>
        }
      />

      {isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">Kayıtlar yüklenirken hata oluştu.</p>
        </div>
      )}

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : items && items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
          <Trash2 className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Bekleyen zayiat kaydı yok.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items?.map((item: DefectiveItemReport) => (
            <Card key={item.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.photoBase64}
                    alt={item.product.name}
                    className="h-20 w-20 shrink-0 rounded-md object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground">{item.product.sku}</p>
                    <p className="mt-1 text-sm">
                      <span className="font-semibold">{item.quantity}</span> {item.product.unit}
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtDate(item.createdAt)}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1"
                    disabled={markWasted.isPending || markExchanged.isPending}
                    onClick={() => markWasted.mutate(item.id)}
                  >
                    Ziyan Oldu
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    disabled={markWasted.isPending || markExchanged.isPending}
                    onClick={() => markExchanged.mutate(item.id)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Değişim Gerçekleşti
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
