'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, ListChecks, Pencil, Users, XCircle } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useApprovePriceUpload,
  usePendingPriceUploads,
  useRejectPriceUpload,
} from '@/hooks/useMudur';
import type { PendingPriceUpload } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

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
          <Skeleton className="h-8 flex-1" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WhatsappFiyatPage() {
  const router = useRouter();
  const { data: uploads, isPending, isError } = usePendingPriceUploads();
  const approveMutation = useApprovePriceUpload();
  const rejectMutation = useRejectPriceUpload();
  const mutationBusy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div>
      <StationPageHeader
        title="WhatsApp Fiyat Güncelleme"
        right={
          <div className="flex flex-col items-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/isletme-app/whatsapp-fiyat/tedarikciler')}
              className="h-auto gap-1.5 p-0 text-xs text-muted-foreground"
            >
              <Users className="h-4 w-4" />
              Tedarikçi Bilgileri
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/isletme-app/whatsapp-fiyat/guncel-listeler')}
              className="h-auto gap-1.5 p-0 text-xs text-muted-foreground"
            >
              <ListChecks className="h-4 w-4" />
              Güncel Fiyat Listeleri
            </Button>
          </div>
        }
      />

      {isError && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Fiyat güncellemeleri yüklenirken hata oluştu.
        </div>
      )}

      {isPending ? (
        <div className="space-y-3">
          <UploadCardSkeleton />
          <UploadCardSkeleton />
        </div>
      ) : (uploads?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
          <CheckCircle className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Onay bekleyen fiyat güncellemesi yok.</p>
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
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-[#28C840] text-[#238031] hover:bg-[#28C840]/10"
                        disabled={mutationBusy}
                        onClick={() => approveMutation.mutate(upload.id)}
                      >
                        <CheckCircle className="h-3.5 w-3.5 text-[#28C840]" />
                        Onayla
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-[#FFBD2E] text-[#91670C] hover:bg-[#FFBD2E]/10"
                        asChild
                      >
                        <Link href={`/isletme-app/whatsapp-fiyat/duzenle?uploadId=${upload.id}`}>
                          <Pencil className="h-3.5 w-3.5 text-[#FFBD2E]" />
                          Düzenle
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-[#FF5F57] text-[#DB1B12] hover:bg-[#FF5F57]/10"
                        disabled={mutationBusy}
                        onClick={() => rejectMutation.mutate(upload.id)}
                      >
                        <XCircle className="h-3.5 w-3.5 text-[#FF5F57]" />
                        Reddet
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
