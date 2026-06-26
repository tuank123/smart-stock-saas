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
import { useAuthStore } from '@/store/auth.store';
import { useStockList, useBranches, useCreateTransfer } from '@/hooks/useMudur';
import type { StockLevel, Branch } from '@/lib/types';

export default function MudurTransferPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: stock, isPending: stockLoading } = useStockList();
  const { data: branches, isPending: branchesLoading } = useBranches();
  const createTransfer = useCreateTransfer();

  const [productId, setProductId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const otherBranches = (branches ?? []).filter((b: Branch) => b.id !== user?.branchId);
  const selectedStock = stock?.find((s: StockLevel) => s.productId === productId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!productId) {
      setError('Lütfen bir ürün seçin.');
      return;
    }
    if (!toBranchId) {
      setError('Lütfen hedef şube seçin.');
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Geçerli bir miktar girin.');
      return;
    }
    if (!user?.branchId) return;

    createTransfer.mutate(
      {
        fromBranchId: user.branchId,
        toBranchId,
        productId,
        quantity: qty,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => router.push('/mudur/stok'),
      },
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-semibold">Transfer Oluştur</h1>
      </div>

      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Ürün */}
              <div className="space-y-1.5">
                <Label htmlFor="transfer-product">Ürün *</Label>
                {stockLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger id="transfer-product">
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

              {/* Hedef şube */}
              <div className="space-y-1.5">
                <Label htmlFor="to-branch">Hedef Şube *</Label>
                {branchesLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : otherBranches.length === 0 ? (
                  <p className="rounded-md border border-muted bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    Transfer yapılabilecek başka şube bulunamadı.
                  </p>
                ) : (
                  <Select value={toBranchId} onValueChange={setToBranchId}>
                    <SelectTrigger id="to-branch">
                      <SelectValue placeholder="Şube seçin…" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherBranches.map((b: Branch) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Miktar */}
              <div className="space-y-1.5">
                <Label htmlFor="transfer-qty">Miktar *</Label>
                <Input
                  id="transfer-qty"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                />
              </div>

              {/* Notlar */}
              <div className="space-y-1.5">
                <Label htmlFor="transfer-notes">Notlar</Label>
                <textarea
                  id="transfer-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Opsiyonel not…"
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
                  className="flex-1"
                  disabled={createTransfer.isPending || otherBranches.length === 0}
                >
                  {createTransfer.isPending ? 'Gönderiliyor…' : 'Transfer Oluştur'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
