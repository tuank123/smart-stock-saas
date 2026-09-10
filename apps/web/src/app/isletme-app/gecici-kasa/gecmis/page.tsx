'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronLeft, ChevronRight, History, Loader2 } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCashierSessions, type CashierSessionSummary } from '@/hooks/useMudur';

const PAGE_SIZE = 50;

function fmtDateTime(s: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(s),
  );
}

function fmtMoney(v: number) {
  return `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`;
}

export default function GeciciKasaGecmisPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const query = useCashierSessions({ page, pageSize: PAGE_SIZE });
  const { refetch } = query;

  // enabled:false → mount olunca (ve sayfa değiştiğinde, queryKey'e page dahil
  // olsa da otomatik tetiklenmediği için) manuel çek.
  useEffect(() => {
    refetch();
  }, [refetch, page]);

  const sessions = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Geçici Kasa Geçmişi" />

      {query.isFetching && sessions.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Yükleniyor…</span>
        </div>
      ) : query.isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Geçmiş yüklenemedi.
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
          <History className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Henüz kasa geçmişi yok.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s: CashierSessionSummary) => (
            <Card
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/isletme-app/gecici-kasa/gecmis/detay?sessionId=${s.id}`)}
              className="cursor-pointer transition-colors hover:bg-muted/50 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CardContent className="p-4">
                <div className="mb-2 space-y-0.5 text-sm">
                  <p>
                    <span className="text-muted-foreground">Açılış:</span> {fmtDateTime(s.openedAt)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Kapanış:</span>{' '}
                    {s.closedAt ? (
                      fmtDateTime(s.closedAt)
                    ) : (
                      <span className="font-medium text-green-600">Hâlâ açık</span>
                    )}
                  </p>
                </div>

                {(s.items ?? []).length === 0 ? (
                  <p className="border-t pt-2 text-xs text-muted-foreground">
                    Bu oturumda satış yok.
                  </p>
                ) : (
                  <ul className="space-y-0.5 border-t pt-2">
                    {(s.items ?? []).map((it, i) => (
                      <li key={i} className="flex justify-between gap-2 text-xs">
                        <span className="min-w-0 truncate">
                          {it.productName}: {it.totalQuantity} adet
                        </span>
                        <span className="shrink-0 tabular-nums">{fmtMoney(it.totalAmount)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-2 flex justify-between border-t pt-2 text-sm font-semibold">
                  <span>Oturum Toplamı</span>
                  <span className="tabular-nums">{fmtMoney(s.sessionTotal)}</span>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Sayfalama — admin/errors ile aynı desen */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Sayfa {page}/{totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Önceki
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sonraki
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
