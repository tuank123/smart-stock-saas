'use client';

import { useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react';

import { PageLayout } from '@/components/layout/PageLayout';
import { PageTabs } from '@/components/layout/PageTabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import type { Branch, PaginatedResponse, StockLevel } from '@/lib/types';

const PAGE_SIZE = 50;

function fetchBranches(): Promise<Branch[]> {
  return api.get<Branch[]>('/branches').then((r) => r.data);
}

function fetchStock(
  branchId: string,
  params: { search: string; critical: boolean; page: number },
): Promise<PaginatedResponse<StockLevel>> {
  return api
    .get<PaginatedResponse<StockLevel>>(`/stock/${branchId}`, {
      params: {
        ...(params.search ? { search: params.search } : {}),
        ...(params.critical ? { critical: true } : {}),
        page: params.page,
        pageSize: PAGE_SIZE,
      },
    })
    .then((r) => r.data);
}

// Kritik sayacı, "Sadece Kritik" butonunun etiketinde gösterilir — ana
// sayfalanmış sorgudan BAĞIMSIZ, hafif bir istek (yalnızca .total okunur,
// pageSize=1 ile gereksiz veri çekilmez).
function fetchCriticalCount(branchId: string): Promise<number> {
  return api
    .get<PaginatedResponse<StockLevel>>(`/stock/${branchId}`, {
      params: { critical: true, page: 1, pageSize: 1 },
    })
    .then((r) => r.data.total);
}

function isCritical(s: StockLevel): boolean {
  return Number(s.quantity) < Number(s.minThreshold);
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border bg-card">
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function StockPage() {
  const [branchId, setBranchId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [page, setPage] = useState(1);

  const branchesQuery = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: fetchBranches,
    staleTime: 1000 * 60,
  });

  const stockQuery: UseQueryResult<PaginatedResponse<StockLevel>> = useQuery<PaginatedResponse<StockLevel>>({
    queryKey: ['stock', branchId, { search, criticalOnly, page }],
    queryFn: () => fetchStock(branchId, { search, critical: criticalOnly, page }),
    enabled: !!branchId,
    staleTime: 1000 * 30,
  });

  const criticalCountQuery = useQuery<number>({
    queryKey: ['stock', branchId, 'critical-count'],
    queryFn: () => fetchCriticalCount(branchId),
    enabled: !!branchId,
    staleTime: 1000 * 30,
  });

  const stock = stockQuery.data?.items ?? [];
  const total = stockQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const criticalCount = criticalCountQuery.data ?? 0;

  function handleBranchChange(value: string) {
    setBranchId(value);
    setSearch('');
    setCriticalOnly(false);
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function toggleCritical() {
    setCriticalOnly((v) => !v);
    setPage(1);
  }

  return (
    <PageLayout title="Stok Durumu">
      <PageTabs
        tabs={[
          { href: '/branches', label: 'Şubeler' },
          { href: '/stock', label: 'Stok' },
          { href: '/products', label: 'Ürünler' },
        ]}
      />
      {/* Toolbar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-56">
          {branchesQuery.isPending ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={branchId} onValueChange={handleBranchChange}>
              <SelectTrigger>
                <SelectValue placeholder="Şube seçin…" />
              </SelectTrigger>
              <SelectContent>
                {(branchesQuery.data ?? []).map((b: Branch) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {branchId && (
          <>
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ürün adı, SKU veya barkod…"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-8"
              />
            </div>

            <Button
              variant={criticalOnly ? 'destructive' : 'outline'}
              size="sm"
              onClick={toggleCritical}
            >
              <AlertTriangle className="mr-1.5 h-4 w-4" />
              {criticalOnly ? 'Tüm Stok' : `Sadece Kritik ${criticalCount > 0 ? `(${criticalCount})` : ''}`}
            </Button>
          </>
        )}
      </div>

      {!branchId ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">Stok bilgisi görmek için bir şube seçin.</p>
        </div>
      ) : stockQuery.isPending ? (
        <TableSkeleton />
      ) : stockQuery.isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Stok bilgisi yüklenemedi.</p>
        </div>
      ) : stock.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {search || criticalOnly ? 'Filtreyle eşleşen ürün bulunamadı.' : 'Bu şubede stok kaydı yok.'}
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ürün</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Mevcut</TableHead>
                <TableHead className="text-right">Min</TableHead>
                <TableHead className="text-right">Max</TableHead>
                <TableHead className="text-center">Durum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.map((s: StockLevel) => {
                const critical = isCritical(s);
                return (
                  <TableRow
                    key={s.id}
                    className={critical ? 'bg-red-50/60 dark:bg-red-950/20' : undefined}
                  >
                    <TableCell className="font-medium">{s.product.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {s.product.sku}
                    </TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(s.quantity).toLocaleString('tr-TR')}{' '}
                      <span className="text-xs text-muted-foreground">{s.product.unit}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {Number(s.minThreshold).toLocaleString('tr-TR')}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {'maxThreshold' in s && s.maxThreshold != null
                        ? Number(s.maxThreshold).toLocaleString('tr-TR')
                        : '—'}
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
    </PageLayout>
  );
}
