'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateSupplier } from '@/hooks/useMudur';

export default function MudurYeniTedarikciPage() {
  const router = useRouter();
  const createSupplier = useCreateSupplier();

  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  function validate(): boolean {
    setError('');
    if (!name.trim()) {
      setError('Tedarikçi adı zorunludur.');
      return false;
    }
    if (!whatsappNumber.trim()) {
      setError('WhatsApp numarası zorunludur.');
      return false;
    }
    if (!whatsappNumber.startsWith('+90')) {
      setError('WhatsApp numarası +90 ile başlamalıdır.');
      return false;
    }
    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    createSupplier.mutate(
      {
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        whatsappNumber: whatsappNumber.trim(),
        notes: notes.trim() || undefined,
      },
      { onSuccess: () => router.push('/mudur/tedarikciler') },
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/mudur/tedarikciler">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Yeni Tedarikçi</h1>
      </div>

      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Tedarikçi Bilgileri
                </p>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Tedarikçi Adı *</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="ör. Ankara Gıda A.Ş."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="contactName">Yetkili Kişi</Label>
                    <Input
                      id="contactName"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="ör. Ahmet Yılmaz"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="whatsappNumber">WhatsApp Numarası *</Label>
                    <Input
                      id="whatsappNumber"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      placeholder="+905xxxxxxxxx"
                    />
                    <p className="text-xs text-muted-foreground">+90 ile başlamalıdır.</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="notes">Notlar</Label>
                    <textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Opsiyonel not…"
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" asChild>
                  <Link href="/mudur/tedarikciler">← Tedarikçilere Dön</Link>
                </Button>
                <Button type="submit" className="flex-1" disabled={createSupplier.isPending}>
                  {createSupplier.isPending ? 'Kaydediliyor…' : 'Kaydet'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
