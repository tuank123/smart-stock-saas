'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, Package, ExternalLink, AlertTriangle } from 'lucide-react';

import { PageLayout } from '@/components/layout/PageLayout';
import { PageTabs } from '@/components/layout/PageTabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import type { PaginatedResponse, Product } from '@/lib/types';

const PAGE_SIZE = 50;

function fetchProducts(search: string, page: number): Promise<PaginatedResponse<Product>> {
  return api
    .get<PaginatedResponse<Product>>('/products', {
      params: {
        ...(search ? { search } : {}),
        page,
        pageSize: PAGE_SIZE,
      },
    })
    .then((r) => r.data);
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border bg-card">
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const productsQuery: UseQueryResult<PaginatedResponse<Product>> = useQuery<PaginatedResponse<Product>>({
    queryKey: ['products', search, page],
    queryFn: () => fetchProducts(search, page),
    staleTime: 1000 * 60 * 2,
  });

  const products = useMemo(() => productsQuery.data?.items ?? [], [productsQuery.data]);
  const total = productsQuery.data?.total ?? 0;
  const isFuzzyResult = productsQuery.data?.matchType === 'fuzzy';
  const totalPages = isFuzzyResult ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <PageLayout title="Ürünler">
      <PageTabs
        tabs={[
          { href: '/branches', label: 'Şubeler' },
          { href: '/stock', label: 'Stok' },
          { href: '/products', label: 'Ürünler' },
        ]}
      />
      {/* Toolbar */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ad, SKU veya barkod ara…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
        <p className="shrink-0 text-sm text-muted-foreground">
          {productsQuery.isSuccess
            ? isFuzzyResult
              ? `${total} öneri`
              : `Toplam ${total} ürün`
            : ' '}
        </p>
      </div>

      {isFuzzyResult && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Tam eşleşme bulunamadı, şunları mı demek istediniz?
          </p>
        </div>
      )}

      {productsQuery.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Ürünler yüklenirken hata oluştu.</p>
        </div>
      )}

      {productsQuery.isPending ? (
        <TableSkeleton />
      ) : products.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {search ? 'Aramayla eşleşen ürün bulunamadı.' : 'Henüz ürün eklenmemiş.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ürün Adı</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Barkod</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Birim</TableHead>
                <TableHead className="text-center">Durum</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p: Product) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{p.sku}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {p.barcode ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {p.category.name}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.unit}</TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={p.isActive ? 'secondary' : 'outline'}
                      className="text-xs"
                    >
                      {p.isActive ? 'Aktif' : 'Pasif'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <Link href={`/products/${p.id}`} aria-label="Detay">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Sayfalama — admin/errors ile aynı desen (fuzzy önerilerde sayfalama yok) */}
          {!isFuzzyResult && (
          <div className="flex items-center justify-between border-t p-3">
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
    </PageLayout>
  );
}
