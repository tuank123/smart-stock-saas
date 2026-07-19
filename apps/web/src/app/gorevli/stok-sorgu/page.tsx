'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, PackageX, RotateCcw, Search } from 'lucide-react';
import { GorevliPageHeader } from '@/components/layout/GorevliPageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useStockQuery } from '@/hooks/useMudur';
import type { StockLevel } from '@/lib/types';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

export default function GorevliStokSorguPage() {
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<StockLevel | null>(null);

  // Debounce the raw input.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  // Only query once there's enough to search on.
  const searchTerm = debounced.length >= MIN_CHARS ? debounced : null;
  const query = useStockQuery(searchTerm);

  const results = query.data ?? [];

  function newSearch() {
    setSelected(null);
    setInput('');
    setDebounced('');
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <GorevliPageHeader title="Stok Sorgulama" />

      {selected ? (
        <StockResultCard item={selected} onReset={newSearch} />
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ürün adını yazın..."
              autoFocus
              className="h-11 pl-9 text-base"
            />
          </div>

          {searchTerm === null ? (
            <p className="px-1 text-sm text-muted-foreground">
              Aramak için en az {MIN_CHARS} karakter yazın.
            </p>
          ) : query.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Aranıyor…</span>
            </div>
          ) : query.isError ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Arama başarısız. Lütfen tekrar deneyin.
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
              <PackageX className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Ürün bulunamadı</p>
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((item: StockLevel) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.product.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {item.product.sku}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-lg font-semibold tabular-nums">
                      {Number(item.quantity).toLocaleString('tr-TR')}
                    </span>
                    <span className="ml-1 text-xs text-muted-foreground">{item.product.unit}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Detay kartı ─────────────────────────────────────────────────────────────

function StockResultCard({ item, onReset }: { item: StockLevel; onReset: () => void }) {
  const quantity = Number(item.quantity);
  const minThreshold = Number(item.minThreshold);
  const unit = item.product.unit;
  const critical = quantity < minThreshold;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold leading-tight">{item.product.name}</h2>
          <p className="font-mono text-sm text-muted-foreground">{item.product.sku}</p>
        </div>

        {critical && (
          <Badge
            variant="outline"
            className="gap-1 border-red-200 bg-red-100 text-sm text-red-700"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Kritik Stok
          </Badge>
        )}

        <div className="flex flex-col items-center">
          <span
            className={`text-6xl font-bold tabular-nums ${critical ? 'text-red-600' : 'text-foreground'}`}
          >
            {quantity.toLocaleString('tr-TR')}
          </span>
          <span className="mt-1 text-lg text-muted-foreground">{unit}</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Min. eşik: {minThreshold.toLocaleString('tr-TR')} {unit}
        </p>

        <Button onClick={onReset} variant="outline" className="mt-2 gap-1.5">
          <RotateCcw className="h-4 w-4" />
          Yeni Arama
        </Button>
      </CardContent>
    </Card>
  );
}
