'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, ExternalLink, AlertTriangle } from 'lucide-react';

import { PageLayout } from '@/components/layout/PageLayout';
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
import type { Product } from '@/lib/types';

function fetchProducts(): Promise<Product[]> {
  return api.get<Product[]>('/products').then((r) => r.data);
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

  const productsQuery = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: fetchProducts,
    staleTime: 1000 * 60 * 2,
  });

  const products = productsQuery.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p: Product) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q) ||
        p.category.name.toLowerCase().includes(q),
    );
  }, [products, search]);

  return (
    <PageLayout title="Ürünler">
      {/* Toolbar */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ad, SKU veya barkod ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <p className="shrink-0 text-sm text-muted-foreground">
          {productsQuery.isSuccess
            ? `${filtered.length} / ${products.length} ürün`
            : ' '}
        </p>
      </div>

      {productsQuery.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Ürünler yüklenirken hata oluştu.</p>
        </div>
      )}

      {productsQuery.isPending ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
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
              {filtered.map((p: Product) => (
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
        </div>
      )}
    </PageLayout>
  );
}
