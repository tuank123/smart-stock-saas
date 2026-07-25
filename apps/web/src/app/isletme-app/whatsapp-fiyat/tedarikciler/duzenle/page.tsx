'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupplierDetail, useUpdateSupplier } from '@/hooks/useMudur';

// ── Inner content — needs useSearchParams so wrapped in Suspense ──────────────

function SupplierEditInner() {
  const searchParams = useSearchParams();
  const supplierId = searchParams.get('supplierId') ?? '';
  const router = useRouter();

  const { data: supplier, isPending, isError } = useSupplierDetail(supplierId);
  const updateSupplier = useUpdateSupplier();

  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phoneLocal, setPhoneLocal] = useState(''); // +90 hariç kalan haneler
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);

  // +90 prefix'i sabit olduğundan kullanıcı numarayı 0'sız girmeli.
  const startsWithZero = phoneLocal.replace(/\s/g, '').startsWith('0');

  useEffect(() => {
    if (supplier && !initialized) {
      setName(supplier.name);
      setContactName(supplier.contactName ?? '');
      // Mevcut numara +90 ile başlıyorsa prefix'i çıkar → input yalnız kalanı gösterir.
      setPhoneLocal(
        supplier.whatsappNumber.startsWith('+90')
          ? supplier.whatsappNumber.slice(3)
          : supplier.whatsappNumber,
      );
      setNotes(supplier.notes ?? '');
      setInitialized(true);
    }
  }, [supplier, initialized]);

  function validate(): boolean {
    setError('');
    if (!name.trim()) {
      setError('Firma adı zorunludur.');
      return false;
    }
    if (!phoneLocal.replace(/\D/g, '')) {
      setError('WhatsApp numarası zorunludur.');
      return false;
    }
    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const whatsappNumber = '+90' + phoneLocal.replace(/\D/g, '');

    updateSupplier.mutate(
      {
        supplierId,
        data: {
          name: name.trim(),
          contactName: contactName.trim() || undefined,
          whatsappNumber,
          notes: notes.trim() || undefined,
        },
      },
      { onSuccess: () => router.replace('/isletme-app/whatsapp-fiyat/tedarikciler') },
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Tedarikçi Düzenle" />

      {isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">Tedarikçi yüklenemedi.</p>
        </div>
      )}

      {!isError && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Firma Adı *</Label>
            {isPending ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ör. Ankara Gıda A.Ş."
                className="w-full"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contactName">İletişim Kişisi</Label>
            {isPending ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Input
                id="contactName"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="ör. Ahmet Yılmaz"
                className="w-full"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="whatsappNumber">WhatsApp Numarası *</Label>
            {isPending ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <div className="flex">
                <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                  +90
                </span>
                <Input
                  id="whatsappNumber"
                  type="tel"
                  inputMode="tel"
                  value={phoneLocal}
                  onChange={(e) => setPhoneLocal(e.target.value)}
                  placeholder="000 000 00 00"
                  className="w-full rounded-l-none"
                />
              </div>
            )}
            {!isPending && startsWithZero && (
              <p className="text-xs text-red-500">
                Numarayı 0 olmadan girin (örn. 000 000 00 00)
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Not</Label>
            {isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Opsiyonel not…"
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="h-11 w-full"
            disabled={updateSupplier.isPending || isPending || startsWithZero}
          >
            {updateSupplier.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </form>
      )}
    </div>
  );
}

// ── Page export — wrap in Suspense for useSearchParams ────────────────────────

export default function SupplierEditPage() {
  return (
    <Suspense>
      <SupplierEditInner />
    </Suspense>
  );
}
