'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useSubmitFeedback } from '@/hooks/useFeedback';

export default function GeriBildirimPage() {
  const submitFeedback = useSubmitFeedback();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (subject.trim().length < 3 || message.trim().length < 3) {
      toast.error('Konu ve mesaj en az 3 karakter olmalıdır');
      return;
    }
    submitFeedback.mutate(
      { subject: subject.trim(), message: message.trim() },
      {
        onSuccess: () => {
          setSubject('');
          setMessage('');
        },
      },
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Geri Bildirim" />

      <p className="mb-4 text-sm text-muted-foreground">
        Bir hata bildirmek değil de bir öneriniz, şikayetiniz ya da isteğiniz mi
        var? Bize buradan ulaşabilirsiniz.
      </p>

      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="feedback-subject">Konu</Label>
          <Input
            id="feedback-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Örn. Rapor ekranı yavaş açılıyor"
            maxLength={200}
            required
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="feedback-message">Mesaj</Label>
          <Textarea
            id="feedback-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Yaşadığınız durumu veya önerinizi detaylandırın..."
            maxLength={5000}
            rows={6}
            required
          />
        </div>

        <div className="pt-1">
          <Button type="submit" disabled={submitFeedback.isPending}>
            {submitFeedback.isPending ? 'Gönderiliyor…' : 'Gönder'}
          </Button>
        </div>
      </form>
    </div>
  );
}
