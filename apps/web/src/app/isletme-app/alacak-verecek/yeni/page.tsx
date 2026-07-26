'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
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
import { useSuppliers, useCreateDebt } from '@/hooks/useMudur';
import type { Supplier } from '@/lib/types';

type Direction = 'PAYABLE' | 'RECEIVABLE';
type DebtType = 'CASH' | 'PRODUCT';

export default function YeniBorcAlacakPage() {
  const router = useRouter();
  const { data: suppliers, isPending: suppliersLoading } = useSuppliers();
  const createDebt = useCreateDebt();

  const [supplierId, setSupplierId] = useState('');
  const [direction, setDirection] = useState<Direction>('PAYABLE');
  const [debtType, setDebtType] = useState<DebtType>('CASH');
  const [amount, setAmount] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

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
      if (!productDescription.trim()) {
        setError('Ürün açıklaması zorunludur.');
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
        productDescription: debtType === 'PRODUCT' ? productDescription.trim() : undefined,
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
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full"
            />
          </div>
        )}

        {/* Ürün Açıklaması (yalnız Ürün) */}
        {debtType === 'PRODUCT' && (
          <div className="space-y-1.5">
            <Label htmlFor="productDescription">Ürün Açıklaması *</Label>
            <textarea
              id="productDescription"
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              rows={3}
              placeholder="Örn. Coca-Cola 33cl - 5 adet eksik"
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
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
