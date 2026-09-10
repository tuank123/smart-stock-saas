'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Phone,
  Wifi,
  WifiOff,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react';

import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import type { Branch, BranchIntegration, PaginatedResponse, StockLevel } from '@/lib/types';

const PAGE_SIZE = 50;

// ── API helpers ───────────────────────────────────────────────────────────────

function fetchBranches(): Promise<Branch[]> {
  return api.get<Branch[]>('/branches').then((r) => r.data);
}
function fetchIntegration(id: string): Promise<BranchIntegration | null> {
  return api.get<BranchIntegration>(`/branches/${id}/integration`)
    .then((r) => r.data)
    .catch((): null => null);
}
function fetchStock(branchId: string, page: number): Promise<PaginatedResponse<StockLevel>> {
  return api
    .get<PaginatedResponse<StockLevel>>(`/stock/${branchId}`, {
      params: { page, pageSize: PAGE_SIZE },
    })
    .then((r) => r.data);
}
// "X kritik" rozeti — ana sayfalanmış sorgudan bağımsız, hafif bir istek
// (yalnızca .total okunur, bkz. /stock sayfasındaki aynı desen).
function fetchCriticalCount(branchId: string): Promise<number> {
  return api
    .get<PaginatedResponse<StockLevel>>(`/stock/${branchId}`, {
      params: { critical: true, page: 1, pageSize: 1 },
    })
    .then((r) => r.data.total);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCritical(level: StockLevel): boolean {
  return Number(level.quantity) < Number(level.minThreshold);
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function InfoCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-28" />
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

// ── Inner content — needs useSearchParams so wrapped in Suspense ──────────────

function BranchDetailInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const [page, setPage] = useState(1);

  const branchesQuery = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: fetchBranches,
  });

  const integrationQuery = useQuery<BranchIntegration | null>({
    queryKey: ['branches', id, 'integration'],
    queryFn: () => fetchIntegration(id),
    enabled: branchesQuery.isSuccess && !!id,
    staleTime: 1000 * 60 * 5,
  });

  const stockQuery: UseQueryResult<PaginatedResponse<StockLevel>> = useQuery<PaginatedResponse<StockLevel>>({
    queryKey: ['stock', id, page],
    queryFn: () => fetchStock(id, page),
    enabled: branchesQuery.isSuccess && !!id,
    staleTime: 1000 * 30,
  });

  const criticalCountQuery = useQuery<number>({
    queryKey: ['stock', id, 'critical-count'],
    queryFn: () => fetchCriticalCount(id),
    enabled: branchesQuery.isSuccess && !!id,
    staleTime: 1000 * 30,
  });

  const branch = branchesQuery.data?.find((b: Branch) => b.id === id);
  const integration = integrationQuery.data ?? null;
  const stock = stockQuery.data?.items ?? [];
  const total = stockQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const criticalCount = criticalCountQuery.data ?? 0;

  const isLoading = branchesQuery.isPending;
  const isError = branchesQuery.isError || (!isLoading && !branch);

  return (
    <PageLayout title={branch?.name ?? 'Şube Detay'}>
      <div className="mb-5">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/branches">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Şubelere Dön
          </Link>
        </Button>
      </div>

      {isError && !isLoading && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            {branchesQuery.isError ? 'Veriler yüklenemedi.' : 'Şube bulunamadı.'}
          </p>
        </div>
      )}

      {/* Branch info card */}
      {isLoading ? (
        <InfoCardSkeleton />
      ) : branch ? (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>{branch.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{branch.slug}</p>
                </div>
              </div>
              <Badge variant={branch.isActive ? 'default' : 'secondary'}>
                {branch.isActive ? 'Aktif' : 'Pasif'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {branch.address && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" />
                {branch.address}
              </div>
            )}
            {branch.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4 shrink-0" />
                {branch.phone}
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              {branch.timezone}
            </div>

            <div className="pt-1">
              {integrationQuery.isPending ? (
                <Skeleton className="h-5 w-28" />
              ) : integration ? (
                <Badge
                  variant="outline"
                  className="flex w-fit items-center gap-1 text-xs text-green-700 border-green-300"
                >
                  <Wifi className="h-3 w-3" />
                  {integration.adapterType}
                  {integration.agentVersion && (
                    <span className="text-muted-foreground"> v{integration.agentVersion}</span>
                  )}
                </Badge>
              ) : (
                <Badge variant="outline" className="flex w-fit items-center gap-1 text-xs text-muted-foreground">
                  <WifiOff className="h-3 w-3" />
                  Entegrasyon yapılandırılmamış
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Stock table */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Stok Durumu
          </h2>
          {criticalCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {criticalCount} kritik
            </Badge>
          )}
        </div>

        {stockQuery.isPending ? (
          <TableSkeleton />
        ) : stock.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            Bu şubede stok kaydı yok.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ürün</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Mevcut</TableHead>
                  <TableHead className="text-right">Min Eşik</TableHead>
                  <TableHead className="text-center">Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.map((s: StockLevel) => {
                  const critical = isCritical(s);
                  return (
                    <TableRow
                      key={s.id}
                      className={critical ? 'bg-red-50/50 dark:bg-red-950/20' : undefined}
                    >
                      <TableCell className="font-medium">{s.product.name}</TableCell>
                      <TableCell className="text-muted-foreground">{s.product.sku}</TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(s.quantity).toLocaleString('tr-TR')} {s.product.unit}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {Number(s.minThreshold).toLocaleString('tr-TR')}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={critical ? 'destructive' : 'secondary'} className="text-xs">
                          {critical ? 'Kritik' : 'Normal'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Sayfalama — admin/errors ile aynı desen */}
            <div className="flex items-center justify-between border-t p-3">
              <p className="text-sm text-muted-foreground">
                Toplam {total} kayıt · Sayfa {page}/{totalPages}
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
          </div>
        )}
      </div>
    </PageLayout>
  );
}

// ── Page export — wrap in Suspense for useSearchParams ────────────────────────

export default function BranchDetailPage() {
  return (
    <Suspense>
      <BranchDetailInner />
    </Suspense>
  );
}
