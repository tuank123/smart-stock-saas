'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ClipboardList } from 'lucide-react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateSupplier } from '@/hooks/useMudur';

export default function WhatsappYeniTedarikciPage() {
  const router = useRouter();
  const createSupplier = useCreateSupplier();

  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phoneLocal, setPhoneLocal] = useState(''); // +90 hariç kalan haneler
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  // +90 prefix'i sabit olduğundan kullanıcı numarayı 0'sız girmeli.
  const startsWithZero = phoneLocal.replace(/\s/g, '').startsWith('0');

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

    // Backend'e tam format gönder: +90 + yalnız rakamlar.
    const whatsappNumber = '+90' + phoneLocal.replace(/\D/g, '');

    createSupplier.mutate(
      {
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        whatsappNumber,
        notes: notes.trim() || undefined,
      },
      { onSuccess: () => router.replace('/isletme-app/whatsapp-fiyat/tedarikciler') },
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader
        title="Yeni Tedarikçi"
        right={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/isletme-app/whatsapp-fiyat/tedarikciler/onay-bekleyen')}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            <ClipboardList className="h-4 w-4" />
            Onay Bekleyen Kayıtlar
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Firma Adı *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ör. Ankara Gıda A.Ş."
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contactName">İletişim Kişisi</Label>
          <Input
            id="contactName"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="ör. Ahmet Yılmaz"
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="whatsappNumber">WhatsApp Numarası *</Label>
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
          {startsWithZero && (
            <p className="text-xs text-red-500">
              Numarayı 0 olmadan girin (örn. 000 000 00 00)
            </p>
          )}
        </div>

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

        <Button
          type="submit"
          className="h-11 w-full"
          disabled={createSupplier.isPending || startsWithZero}
        >
          {createSupplier.isPending ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </form>
    </div>
  );
}
