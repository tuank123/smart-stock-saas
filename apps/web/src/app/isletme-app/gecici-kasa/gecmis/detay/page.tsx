'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Loader2, ReceiptText } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import {
  useCashierSessions,
  type CashierSessionSummary,
  type CashierReceipt,
} from '@/hooks/useMudur';

function fmtDateTime(s: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(s),
  );
}

function fmtTime(s: string) {
  return new Intl.DateTimeFormat('tr-TR', { timeStyle: 'short' }).format(new Date(s));
}

function fmtMoney(v: number) {
  return `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`;
}

// ── Inner content — needs useSearchParams so wrapped in Suspense ──────────────

function CashierSessionDetailInner() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') ?? '';

  const query = useCashierSessions();
  const { refetch } = query;

  // enabled:false → mount olunca manuel çek (mevcut liste hook'undan filtrelenir).
  useEffect(() => {
    refetch();
  }, [refetch]);

  const sessions = query.data ?? [];
  const session = sessions.find((s: CashierSessionSummary) => s.id === sessionId) ?? null;
  // Savunma: API eski/kısmi yanıt döndürse bile (receipts eksikse) çökme.
  const receipts = session?.receipts ?? [];

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Fiş Detayları" />

      {query.isFetching && sessions.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Yükleniyor…</span>
        </div>
      ) : query.isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Detay yüklenemedi.
        </div>
      ) : !session ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Oturum bulunamadı.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Özet kutusu */}
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Toplam Satış</p>
            <p className="text-2xl font-bold tabular-nums">{fmtMoney(session.sessionTotal)}</p>
            <div className="mt-2 space-y-0.5 border-t pt-2 text-sm">
              <p>
                <span className="text-muted-foreground">Açılış:</span> {fmtDateTime(session.openedAt)}
              </p>
              <p>
                <span className="text-muted-foreground">Kapanış:</span>{' '}
                {session.closedAt ? (
                  fmtDateTime(session.closedAt)
                ) : (
                  <span className="font-medium text-green-600">Hâlâ açık</span>
                )}
              </p>
            </div>
          </div>

          {/* Fişler */}
          {receipts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
              <ReceiptText className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Bu oturumda satış yapılmamış.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {receipts.map((r: CashierReceipt) => (
                <Card key={r.transactionId}>
                  <CardContent className="p-4">
                    <p className="mb-2 border-b pb-2 text-xs font-medium text-muted-foreground">
                      Fiş #{r.transactionId.slice(0, 8)} · {fmtTime(r.createdAt)} ·{' '}
                      {r.paymentMethod === 'CASH' ? 'Nakit' : 'Kart'}
                    </p>
                    <ul className="space-y-0.5">
                      {r.items.map((it, i) => (
                        <li key={i} className="flex justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate">
                            {it.productName} x{it.quantity}
                          </span>
                          <span className="shrink-0 tabular-nums">{fmtMoney(it.lineTotal)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex justify-between border-t pt-2 text-sm font-semibold">
                      <span>Fiş Toplamı</span>
                      <span className="tabular-nums">{fmtMoney(r.total)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page export — wrap in Suspense for useSearchParams ────────────────────────

export default function CashierSessionDetailPage() {
  return (
    <Suspense>
      <CashierSessionDetailInner />
    </Suspense>
  );
}
