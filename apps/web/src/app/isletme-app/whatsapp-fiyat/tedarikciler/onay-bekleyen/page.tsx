'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle, Copy, FileText, Link2, UserPlus, XCircle } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useApprovePriceUpload,
  usePendingPriceUploads,
  useRejectPriceUpload,
  useSupplierPortalLink,
} from '@/hooks/useMudur';
import type { PendingPriceUpload } from '@/lib/types';

function fmt(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(dateStr));
}

function CardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-28" />
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 flex-1" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function OnayBekleyenTedarikcilerPage() {
  const { data: uploads, isPending, isError } = usePendingPriceUploads();
  const approveMutation = useApprovePriceUpload();
  const rejectMutation = useRejectPriceUpload();
  const mutationBusy = approveMutation.isPending || rejectMutation.isPending;

  // Portal linki — enabled:false, mount olunca manuel çek.
  const portalQuery = useSupplierPortalLink();
  const { refetch: refetchPortal } = portalQuery;
  useEffect(() => {
    refetchPortal();
  }, [refetchPortal]);

  const portalUrl = portalQuery.data?.url ?? '';

  async function copyPortalLink() {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      toast.success('Portal linki kopyalandı');
    } catch {
      toast.error('Kopyalanamadı');
    }
  }

  // Yalnız yeni tedarikçi kayıtları.
  const newSuppliers = (uploads ?? []).filter(
    (u: PendingPriceUpload) => u.uploadType === 'NEW_SUPPLIER',
  );

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Onay Bekleyen Yeni Tedarikçiler" />

      {/* Tedarikçi portalı linki */}
      <div className="mb-5 rounded-xl border bg-card p-4">
        <div className="mb-1 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Tedarikçi Portalı Linki</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Bu linki toptancınıza WhatsApp&apos;tan gönderin; fatura/fiyat listesi yükleyebilsinler.
        </p>
        {portalQuery.isFetching && !portalUrl ? (
          <Skeleton className="h-9 w-full" />
        ) : portalQuery.isError ? (
          <p className="text-sm text-destructive">Portal linki alınamadı.</p>
        ) : (
          <div className="flex gap-2">
            <Input readOnly value={portalUrl} className="w-full text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={copyPortalLink}
              disabled={!portalUrl}
              aria-label="Kopyala"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {isError && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Kayıtlar yüklenirken hata oluştu.
        </div>
      )}

      {isPending ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : newSuppliers.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
          <UserPlus className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Onay bekleyen yeni tedarikçi kaydı yok.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {newSuppliers.map((upload: PendingPriceUpload) => (
            <Card key={upload.id}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {upload.ocrExtractedFirm ?? 'Yeni Tedarikçi Kaydı'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {upload.uploaderPhone} · {fmt(upload.createdAt)}
                    </p>
                    {upload.pdfUrl && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3 shrink-0" />
                        Dosya eklendi
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
