'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CalendarDays, TrendingDown, TrendingUp, Store } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDailyReport,
  useDailyReportHistory,
  type DailyReportProduct,
  type DailyReportSession,
  type DailyReportHistoryDay,
} from '@/hooks/useMudur';

function fmtMoney(n: number) {
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

function fmtTime(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(dateStr),
  );
}

// 'YYYY-MM-DD' → yerel Date (UTC kayması olmadan).
function parseLocalDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// 'YYYY-MM-DD' → "29 Temmuz Çarşamba".
function fmtDayLong(dateStr: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(parseLocalDay(dateStr));
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ProductList({ items }: { items: DailyReportProduct[] }) {
  if (items.length === 0) {
    return <p className="px-1 text-sm text-muted-foreground">Bu gün satış yapılmadı.</p>;
  }
  return (
    <div className="space-y-1.5">
      {items.map((p, i) => (
        <div
          key={p.productId}
          className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="w-5 shrink-0 text-sm font-semibold text-muted-foreground">
              {i + 1}.
            </span>
            <span className="truncate text-sm font-medium">{p.productName}</span>
          </div>
          <div className="shrink-0 text-right text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">
              {p.totalQty.toLocaleString('tr-TR')}
            </span>{' '}
            adet · {fmtMoney(p.totalRevenue)}
          </div>
        </div>
      ))}
    </div>
  );
}

function GunlukRaporInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date') ?? '';
  const isToday = !dateParam || dateParam === todayStr();

  const { data, isPending, isError } = useDailyReport(dateParam || undefined);
  const history = useDailyReportHistory(10);

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Günlük Rapor" />

      {/* Geçmiş bir gün görüntüleniyorsa tarih başlığı + Bugüne Dön */}
      {!isToday && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{fmtDayLong(dateParam)} Raporu</p>
          <button
            type="button"
            onClick={() => router.push('/isletme-app/gunluk-rapor')}
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            Bugüne Dön
          </button>
        </div>
      )}

      {isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : isError || !data ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">Rapor yüklenemedi.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Ciro */}
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">
                {isToday ? 'Bugünkü Ciro' : 'Günün Cirosu'}
              </p>
              <p className="mt-1 text-4xl font-bold tabular-nums">
                {fmtMoney(data.grossRevenue)}
              </p>
            </CardContent>
          </Card>

          {/* En çok satan 10 */}
          <div>
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-green-600" />
              En Çok Satan 10 Ürün
            </h2>
            <ProductList items={data.topSellers} />
          </div>

          {/* En az satan 10 */}
          <div>
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <TrendingDown className="h-4 w-4 text-amber-600" />
              En Az Satan 10 Ürün
            </h2>
            <ProductList items={data.bottomSellers} />
          </div>

          {/* Kasa oturumları */}
          <div>
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <Store className="h-4 w-4 text-primary" />
              Kasa Oturumları
            </h2>
            {data.cashierSessions.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">Bu gün kasa oturumu açılmadı.</p>
            ) : (
              <div className="space-y-1.5">
                {data.cashierSessions.map((s: DailyReportSession) => (
                  <Link
                    key={s.id}
                    href={`/isletme-app/gecici-kasa/gecmis/detay?sessionId=${s.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40"
                  >
                    <span className="text-sm">
                      {fmtTime(s.openedAt)} –{' '}
                      {s.closedAt ? fmtTime(s.closedAt) : 'Hâlâ açık'}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {fmtMoney(s.sessionTotal)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Geçmiş Raporlar */}
      <div className="mt-8">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          Geçmiş Raporlar
        </h2>
        {history.isPending ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : history.isError || !history.data ? (
          <p className="px-1 text-sm text-muted-foreground">Geçmiş yüklenemedi.</p>
        ) : (
          <div className="space-y-1.5">
            {history.data.days.map((d: DailyReportHistoryDay) => {
              const active = (dateParam || todayStr()) === d.date;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => router.replace(`/isletme-app/gunluk-rapor?date=${d.date}`)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 ${
                    active ? 'border-primary bg-muted/30' : 'bg-card'
                  }`}
                >
                  <span className="text-sm">{fmtDayLong(d.date)}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {fmtMoney(d.grossRevenue)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GunlukRaporPage() {
  return (
    <Suspense>
      <GunlukRaporInner />
    </Suspense>
  );
}
