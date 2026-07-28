'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSuppliers, useCreateDebt, useStockList } from '@/hooks/useMudur';
import type { Supplier, StockLevel } from '@/lib/types';

type Direction = 'PAYABLE' | 'RECEIVABLE';
type DebtType = 'CASH' | 'PRODUCT';

interface BasketLine {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
}

export default function YeniBorcAlacakPage() {
  const router = useRouter();
  const { data: suppliers, isPending: suppliersLoading } = useSuppliers();
  const { data: stock } = useStockList();
  const createDebt = useCreateDebt();

  const [supplierId, setSupplierId] = useState('');
  const [direction, setDirection] = useState<Direction>('PAYABLE');
  const [debtType, setDebtType] = useState<DebtType>('CASH');
  const [amount, setAmount] = useState('');
  const [productLines, setProductLines] = useState<BasketLine[]>([]);
  const [itemProductId, setItemProductId] = useState('');
  const [itemQty, setItemQty] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  function addLine() {
    setError('');
    if (!itemProductId) {
      setError('Ürün seçin.');
      return;
    }
    const qty = Number(itemQty.replace(',', '.'));
    if (!qty || qty <= 0) {
      setError('Geçerli bir miktar girin.');
      return;
    }
    if (productLines.some((l) => l.productId === itemProductId)) {
      setError('Bu ürün zaten eklendi.');
      return;
    }
    const s = (stock ?? []).find((x: StockLevel) => x.productId === itemProductId);
    setProductLines((prev) => [
      ...prev,
      {
        productId: itemProductId,
        productName: s?.product.name ?? itemProductId,
        quantity: qty,
        unit: s?.product.unit ?? 'adet',
      },
    ]);
    setItemProductId('');
    setItemQty('');
  }

  function removeLine(productId: string) {
    setProductLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function validate(): boolean {
    setError('');
    if (!supplierId) {
      setError('Tedarikçi seçimi zorunludur.');
      return false;
    }
    if (debtType === 'CASH') {
      const parsed = Number(amount.replace(',', '.'));
      if (!parsed || parsed <= 0) {
        setError('Geçerli bir tutar girin.');
        return false;
      }
    } else {
      if (productLines.length === 0) {
        setError('En az bir ürün ekleyin.');
        return false;
      }
    }
    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    createDebt.mutate(
      {
        supplierId,
        direction,
        debtType,
        amount: debtType === 'CASH' ? Number(amount.replace(',', '.')) : undefined,
        productLines:
          debtType === 'PRODUCT'
            ? productLines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
            : undefined,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
      },
      { onSuccess: () => router.replace('/isletme-app/alacak-verecek') },
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Yeni Borç/Alacak Kaydı" />

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tedarikçi */}
        <div className="space-y-1.5">
          <Label htmlFor="supplier">Tedarikçi *</Label>
          {suppliersLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="supplier">
                <SelectValue placeholder="Tedarikçi seçin…" />
              </SelectTrigger>
              <SelectContent>
                {(suppliers ?? []).map((s: Supplier) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Yön */}
        <div className="space-y-1.5">
          <Label htmlFor="direction">Yön *</Label>
          <Select value={direction} onValueChange={(v) => setDirection(v as Direction)}>
            <SelectTrigger id="direction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PAYABLE">İşletme Tedarikçiye Borçlu</SelectItem>
              <SelectItem value="RECEIVABLE">Tedarikçi İşletmeye Borçlu</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tür — Nakit / Ürün */}
        <div className="space-y-1.5">
          <Label>Tür *</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={debtType === 'CASH' ? 'default' : 'outline'}
              onClick={() => setDebtType('CASH')}
            >
              Nakit
            </Button>
            <Button
              type="button"
              variant={debtType === 'PRODUCT' ? 'default' : 'outline'}
              onClick={() => setDebtType('PRODUCT')}
            >
              Ürün
            </Button>
          </div>
        </div>

        {/* Tutar (yalnız Nakit) */}
        {debtType === 'CASH' && (
          <div className="space-y-1.5">
            <Label htmlFor="amount">Tutar (₺) *</Label>
            <Input
              id="amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full"
            />
          </div>
        )}

        {/* Ürün sepeti (yalnız Ürün) */}
        {debtType === 'PRODUCT' && (
          <div className="space-y-3 rounded-lg border p-3">
            <Label>Ürünler *</Label>

            {/* Ürün ekleme satırı */}
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Select value={itemProductId} onValueChange={setItemProductId}>
                  <SelectTrigger className="min-w-0">
                    <SelectValue placeholder="Ürün seçin…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(stock ?? []).map((s: StockLevel) => (
                      <SelectItem key={s.productId} value={s.productId}>
                        {s.product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                type="text"
                inputMode="decimal"
                value={itemQty}
                onChange={(e) => setItemQty(e.target.value)}
                placeholder="Miktar"
                className="w-24"
              />
              <Button type="button" variant="outline" size="icon" onClick={addLine}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Eklenen ürünler */}
            {productLines.length === 0 ? (
              <p className="text-xs text-muted-foreground">Henüz ürün eklenmedi.</p>
            ) : (
              <div className="space-y-1.5">
                {productLines.map((l) => (
                  <div
                    key={l.productId}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {l.productName}
                      <span className="ml-1 text-muted-foreground">
                        × {l.quantity} {l.unit}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLine(l.productId)}
                      aria-label="Ürünü çıkar"
                      className="shrink-0 rounded-md px-1.5 py-1 text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Vade Tarihi */}
        <div className="space-y-1.5">
          <Label htmlFor="dueDate">Vade Tarihi</Label>
          <Input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full"
          />
        </div>

        {/* Not */}
        <div className="space-y-1.5">
          <Label htmlFor="notes">Not</Label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Opsiyonel not…"
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        <Button type="submit" className="h-11 w-full" disabled={createDebt.isPending}>
          {createDebt.isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </form>
    </div>
  );
}
