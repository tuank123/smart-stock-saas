'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useStockList } from '@/hooks/useMudur';
import type { StockLevel } from '@/lib/types';

const PAGE_SIZE = 50;

function isCritical(s: StockLevel) {
  return Number(s.quantity) < Number(s.minThreshold);
}

export default function MudurStokPage() {
  const [search, setSearch] = useState('');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isPending, isError } = useStockList({
    search,
    critical: criticalOnly,
    page,
    pageSize: PAGE_SIZE,
  });

  const stock = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function toggleCritical() {
    setCriticalOnly((v) => !v);
    setPage(1);
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Stok</h1>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Ürün adı veya SKU ara…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={criticalOnly ? 'destructive' : 'outline'}
            size="sm"
            onClick={toggleCritical}
            className="flex items-center gap-1.5 shrink-0"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Kritik
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/mudur/stok/fire">Fire Kaydet</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/mudur/stok/transfer">Transfer</Link>
          </Button>
        </div>
      </div>

      {isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Stok verileri yüklenirken hata oluştu.</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-4 py-3 font-medium text-muted-foreground">Ürün Adı</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">SKU</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-right">Miktar</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-right">Min Eşik</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Durum</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-40" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Skeleton className="ml-auto h-4 w-12" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Skeleton className="ml-auto h-4 w-12" />
                  </td>
                  <td className="px-4 py-3">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </td>
                </tr>
              ))
            ) : stock.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {search || criticalOnly ? 'Eşleşen ürün yok.' : 'Stok kaydı bulunamadı.'}
                </td>
              </tr>
            ) : (
              stock.map((s: StockLevel) => {
                const critical = isCritical(s);
                return (
                  <tr
                    key={s.id}
                    className="border-b last:border-0 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/mudur/stok/detay?productId=${s.productId}`}
                        className="font-medium hover:underline"
                      >
                        {s.product.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {s.product.sku}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${critical ? 'text-destructive' : ''}`}
                    >
                      {Number(s.quantity).toLocaleString('tr-TR')} {s.product.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {Number(s.minThreshold).toLocaleString('tr-TR')}
                    </td>
                    <td className="px-4 py-3">
                      {critical ? (
                        <Badge variant="destructive" className="text-xs">
                          Kritik
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-green-300 bg-green-50 text-xs text-green-700"
                        >
                          Normal
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {!isPending && stock.length > 0 && (
          <div className="flex items-center justify-between border-t p-3">
            <p className="text-xs text-muted-foreground">
              Toplam {total} ürün · Sayfa {page}/{totalPages}
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
    </div>
  );
}
