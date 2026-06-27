'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Pencil, Plus, Search, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useSuppliers } from '@/hooks/useMudur';
import type { Supplier } from '@/lib/types';

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function MudurTedarikcilerPage() {
  const { data: suppliers, isPending, isError } = useSuppliers();
  const [search, setSearch] = useState('');

  const filtered = (suppliers ?? []).filter((s: Supplier) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Tedarikçiler</h1>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/mudur/tedarikciler/yeni">
            <Plus className="h-4 w-4" />
            Yeni Tedarikçi
          </Link>
        </Button>
      </div>

      {/* Arama */}
      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Tedarikçi ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Tedarikçiler yüklenirken hata oluştu.
        </div>
      )}

      {isPending ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card py-14 text-center">
          <p className="text-sm text-muted-foreground">
            {search ? 'Arama sonucu bulunamadı.' : 'Henüz tedarikçi eklenmemiş.'}
          </p>
          {!search && (
            <Button asChild size="sm" variant="outline" className="mt-1 gap-1.5">
              <Link href="/mudur/tedarikciler/yeni">
                <Plus className="h-3.5 w-3.5" />
                İlk tedarikçiyi ekle
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((supplier: Supplier) => (
            <Card key={supplier.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">{supplier.name}</p>
                    {supplier.contactName && (
                      <p className="text-sm text-muted-foreground">{supplier.contactName}</p>
                    )}
                    <p className="text-sm text-muted-foreground">{supplier.whatsappNumber}</p>
                    <div className="pt-0.5">
                      {supplier.otpVerified ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-green-200 bg-green-100 text-xs text-green-700"
                        >
                          <CheckCircle className="h-3 w-3" />
                          Doğrulandı
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="gap-1 border-slate-200 bg-slate-100 text-xs text-slate-500"
                        >
                          <XCircle className="h-3 w-3" />
                          Doğrulanmadı
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5">
                    <Link href={`/mudur/tedarikciler/${supplier.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                      Düzenle
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
