'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useStockList, useWaste } from '@/hooks/useMudur';
import type { StockLevel } from '@/lib/types';

export default function MudurFirePage() {
  const router = useRouter();
  const { data: stock, isPending: stockLoading } = useStockList();
  const wasteMutation = useWaste();

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!productId) {
      setError('Lütfen bir ürün seçin.');
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty < 0.001) {
      setError('Miktar en az 0.001 olmalıdır.');
      return;
    }
    if (!reason.trim()) {
      setError('Sebep alanı zorunludur.');
      return;
    }

    wasteMutation.mutate(
      { productId, quantity: qty, reason: reason.trim() },
      {
        onSuccess: () => {
          setProductId('');
          setQuantity('');
          setReason('');
        },
      },
    );
  }

  const selectedStock = stock?.find((s: StockLevel) => s.productId === productId);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Fire Kaydı</h1>
      </div>

      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Ürün seç */}
              <div className="space-y-1.5">
                <Label htmlFor="product">Ürün *</Label>
                {stockLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger id="product">
                      <SelectValue placeholder="Ürün seçin…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(stock ?? []).map((s: StockLevel) => (
                        <SelectItem key={s.productId} value={s.productId}>
                          {s.product.name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({s.product.sku})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedStock && (
                  <p className="text-xs text-muted-foreground">
                    Mevcut stok:{' '}
                    <span className="font-medium">
                      {Number(selectedStock.quantity).toLocaleString('tr-TR')}{' '}
                      {selectedStock.product.unit}
                    </span>
                  </p>
                )}
              </div>

              {/* Miktar */}
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Miktar *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>

              {/* Sebep */}
              <div className="space-y-1.5">
                <Label htmlFor="reason">Sebep *</Label>
                <textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Fire sebebini açıklayın…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => router.back()}
                >
                  İptal
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  className="flex-1"
                  disabled={wasteMutation.isPending}
                >
                  {wasteMutation.isPending ? 'Kaydediliyor…' : 'Fire Kaydet'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
