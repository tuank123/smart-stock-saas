'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, AlertTriangle } from 'lucide-react';

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
import type { Branch, StockLevel } from '@/lib/types';

function fetchBranches(): Promise<Branch[]> {
  return api.get<Branch[]>('/branches').then((r) => r.data);
}
function fetchStock(branchId: string): Promise<StockLevel[]> {
  return api.get<StockLevel[]>(`/stock/${branchId}`).then((r) => r.data);
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

  const branchesQuery = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: fetchBranches,
    staleTime: 1000 * 60,
  });

  const stockQuery = useQuery<StockLevel[]>({
    queryKey: ['stock', branchId],
    queryFn: () => fetchStock(branchId),
    enabled: !!branchId,
    staleTime: 1000 * 30,
  });

  const stock = stockQuery.data ?? [];

  const filtered = useMemo(() => {
    let items = stock;
    if (criticalOnly) items = items.filter(isCritical);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (s: StockLevel) =>
          s.product.name.toLowerCase().includes(q) ||
          s.product.sku.toLowerCase().includes(q) ||
          (s.product.barcode ?? '').toLowerCase().includes(q),
      );
    }
    return items;
  }, [stock, search, criticalOnly]);

  const criticalCount = stock.filter(isCritical).length;

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
            <Select value={branchId} onValueChange={setBranchId}>
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
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            <Button
              variant={criticalOnly ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => setCriticalOnly((v) => !v)}
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
      ) : filtered.length === 0 ? (
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
              {filtered.map((s: StockLevel) => {
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
        </div>
      )}
    </PageLayout>
  );
}
