'use client';

import Link from 'next/link';
import { Eye, ListChecks, Pencil } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useApprovedPriceUploads } from '@/hooks/useMudur';
import type { PendingPriceUpload } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────
// fmt/supplierName/UploadCardSkeleton, ana sayfadaki (whatsapp-fiyat/page.tsx)
// bekleyen liste kartlarıyla AYNI görsel desen — kasıtlı olarak tekrarlandı
// (iki farklı liste, ortak bir alt bileşene çıkarmak bu görevin kapsamında değil).

function fmt(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(dateStr));
}

function supplierName(upload: PendingPriceUpload) {
  return upload.supplier?.name ?? upload.ocrExtractedFirm ?? 'Bilinmeyen Tedarikçi';
}

function UploadCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 flex-1" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GuncelFiyatListeleriPage() {
  const { data: uploads, isPending, isError } = useApprovedPriceUploads();

  return (
    <div>
      <StationPageHeader title="Güncel Fiyat Listeleri" />

      {isError && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Fiyat listeleri yüklenirken hata oluştu.
        </div>
      )}

      {isPending ? (
        <div className="space-y-3">
          <UploadCardSkeleton />
          <UploadCardSkeleton />
        </div>
      ) : (uploads?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
          <ListChecks className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Henüz onaylanmış fiyat listesi yok.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(uploads ?? []).map((upload: PendingPriceUpload) => {
            const itemCount = Array.isArray(upload.parsedItems) ? upload.parsedItems.length : null;
            return (
              <Card key={upload.id}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="space-y-0.5">
                      <p className="font-semibold">{supplierName(upload)}</p>
                      <p className="text-xs text-muted-foreground">
                        {itemCount != null && `${itemCount} ürün · `}
                        {fmt(upload.createdAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5" asChild>
                        <Link href={`/isletme-app/whatsapp-fiyat/duzenle?uploadId=${upload.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                          Düzenle
                        </Link>
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" asChild>
                        <Link
                          href={`/isletme-app/whatsapp-fiyat/duzenle?uploadId=${upload.id}&readOnly=1`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          İncele
                        </Link>
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
  );
}
