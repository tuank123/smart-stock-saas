'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertTriangle,
  ShoppingCart,
  TrendingDown,
  FileText,
  ArrowDown,
  ArrowUp,
  Calendar,
} from 'lucide-react';

import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQueryClient } from '@tanstack/react-query';
import { useReport } from '@/hooks/useReports';
import type { DailyPayload, MonthlyPayload, ReportDetail } from '@/lib/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(dateStr));
}

function currency(val: number) {
  return `${Number(val).toLocaleString('tr-TR')} ₺`;
}

// ── Stat card (same pattern as dashboard/page.tsx) ────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: 'warning';
}

function StatCard({ label, value, icon, highlight }: StatCardProps) {
  const warn = highlight === 'warning' && Number(value) > 0;
  return (
    <div
      className={`rounded-lg border bg-card p-4 shadow-sm ${
        warn ? 'border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={warn ? 'text-amber-500' : 'text-muted-foreground'}>{icon}</span>
      </div>
      <p className={`mt-2 text-3xl font-bold ${warn ? 'text-amber-600 dark:text-amber-400' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-4 rounded-full" />
      </div>
      <Skeleton className="h-8 w-20" />
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}

// ── DAILY detail ──────────────────────────────────────────────────────────────

function DailyDetail({ payload }: { payload: DailyPayload }) {
  const { totals, branches, anomalies } = payload;

  return (
    <>
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Toplam Sipariş"
          value={totals.totalOrders}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <StatCard
          label="Kritik Stok"
          value={totals.totalCriticalStock}
          icon={<AlertTriangle className="h-4 w-4" />}
          highlight="warning"
        />
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">Stok Hareketi</p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="flex items-center gap-1 text-xl font-bold text-green-600">
              <ArrowDown className="h-4 w-4" />
              {totals.totalMovementsIn.toLocaleString('tr-TR')}
            </span>
            <span className="text-muted-foreground">/</span>
            <span className="flex items-center gap-1 text-xl font-bold text-red-500">
              <ArrowUp className="h-4 w-4" />
              {totals.totalMovementsOut.toLocaleString('tr-TR')}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Giriş / Çıkış</p>
        </div>
      </div>

      {/* Branches table */}
      <div className="mt-6">
        <SectionHeading>Şubeler</SectionHeading>
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Şube</TableHead>
                <TableHead className="text-right">Sipariş</TableHead>
                <TableHead className="text-right">Onaylanan Değer</TableHead>
                <TableHead className="text-right">Kritik Stok</TableHead>
                <TableHead className="text-right">Giriş</TableHead>
                <TableHead className="text-right">Çıkış</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.branchId}>
                  <TableCell className="font-medium">{b.branchName}</TableCell>
                  <TableCell className="text-right">{b.totalOrders}</TableCell>
                  <TableCell className="text-right">{currency(b.approvedOrdersValue)}</TableCell>
                  <TableCell className="text-right">
                    {b.criticalStockCount > 0 ? (
                      <span className="font-semibold text-amber-600">{b.criticalStockCount}</span>
                    ) : (
                      b.criticalStockCount
                    )}
                  </TableCell>
                  <TableCell className="text-right text-green-600">{b.stockMovementsIn}</TableCell>
                  <TableCell className="text-right text-red-500">{b.stockMovementsOut}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div className="mt-6">
          <SectionHeading>
            <span className="flex items-center gap-1.5 text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Fiyat Anomalileri
            </span>
          </SectionHeading>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün ID</TableHead>
                  <TableHead className="text-right">Eski Fiyat</TableHead>
                  <TableHead className="text-right">Yeni Fiyat</TableHead>
                  <TableHead className="text-right">Değişim %</TableHead>
                  <TableHead>Tarih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anomalies.map((a) => (
                  <TableRow
                    key={a.id}
                    className={a.anomalyFlag ? 'bg-orange-50/60 dark:bg-orange-950/20' : undefined}
                  >
                    <TableCell className="font-mono text-xs">{a.productId.slice(0, 8)}</TableCell>
                    <TableCell className="text-right">{currency(a.oldPrice)}</TableCell>
                    <TableCell className="text-right font-semibold">{currency(a.newPrice)}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          a.changePct > 0
                            ? 'border-red-300 bg-red-50 text-red-700'
                            : 'border-green-300 bg-green-50 text-green-700'
                        }`}
                      >
                        {a.changePct > 0 ? '+' : ''}
                        {a.changePct.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDate(a.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </>
  );
}

// ── MONTHLY detail ────────────────────────────────────────────────────────────

function MonthlyDetail({ payload }: { payload: MonthlyPayload }) {
  const { totals, branchComparison, dailyReportCount } = payload;

  return (
    <>
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Toplam Sipariş"
          value={totals.totalOrders}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <StatCard
          label="Fiyat Anomalisi"
          value={totals.priceAnomalies}
          icon={<TrendingDown className="h-4 w-4" />}
          highlight="warning"
        />
        <StatCard
          label="Günlük Rapor Sayısı"
          value={dailyReportCount}
          icon={<Calendar className="h-4 w-4" />}
        />
      </div>

      {/* Branch comparison table */}
      <div className="mt-6">
        <SectionHeading>Şube Karşılaştırma</SectionHeading>
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Şube</TableHead>
                <TableHead className="text-right">Sipariş</TableHead>
                <TableHead className="text-right">Stok Hareketi</TableHead>
                <TableHead className="text-right">Kritik Stok</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branchComparison.map((b) => (
                <TableRow key={b.branchId}>
                  <TableCell className="font-medium">{b.branchName}</TableCell>
                  <TableCell className="text-right">{b.orderCount}</TableCell>
                  <TableCell className="text-right">{b.stockMovementCount}</TableCell>
                  <TableCell className="text-right">
                    {b.criticalStockCount > 0 ? (
                      <span className="font-semibold text-amber-600">{b.criticalStockCount}</span>
                    ) : (
                      b.criticalStockCount
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportDetailPage({ params }: { params: { id: string } }) {
  const qc = useQueryClient();
  const query = useReport(params.id);
  const report = query.data;

  useEffect(() => {
    if (query.isSuccess) {
      qc.invalidateQueries({ queryKey: ['reports', 'unread'] });
    }
  }, [query.isSuccess, qc]);

  const title = report
    ? `${report.reportType === 'DAILY' ? 'Günlük' : 'Aylık'} Rapor — ${fmtDate(report.reportDate)}`
    : 'Rapor Detay';

  function isDaily(r: ReportDetail): r is ReportDetail & { payload: DailyPayload } {
    return r.reportType === 'DAILY';
  }

  return (
    <PageLayout title={title}>
      {/* Back button */}
      <div className="mb-5 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/reports">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Raporlara Dön
          </Link>
        </Button>

        {report?.pdfUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={report.pdfUrl} target="_blank" rel="noreferrer">
              <FileText className="mr-1.5 h-4 w-4" />
              PDF İndir
            </a>
          </Button>
        )}
      </div>

      {/* Error */}
      {query.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Rapor yüklenemedi.</p>
        </div>
      )}

      {/* Loading */}
      {query.isPending && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      )}

      {/* Detail */}
      {report && (
        isDaily(report)
          ? <DailyDetail payload={report.payload as DailyPayload} />
          : <MonthlyDetail payload={report.payload as MonthlyPayload} />
      )}
    </PageLayout>
  );
}
