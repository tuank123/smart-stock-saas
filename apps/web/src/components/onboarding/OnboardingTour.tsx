'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ONBOARDING_STEPS } from '@/lib/help-content';
import { hasSeenOnboarding, markOnboardingSeen } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

/**
 * isletme-app/dashboard'a İLK gelişte gösterilen kısa tanıtım turu.
 * Kendi kendine yeter: hasSeenOnboarding() localStorage'da yoksa açılır,
 * "Atla"/"Başla"/dialog'un dışına tıklama/Esc — hepsi aynı şekilde
 * markOnboardingSeen() çağırıp bir daha göstermez.
 */
export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!hasSeenOnboarding()) setOpen(true);
  }, []);

  function finish() {
    markOnboardingSeen();
    setOpen(false);
  }

  // Dialog'un KENDİ kapanma yolları (Esc, dış tıklama, X butonu) da "görüldü"
  // sayılmalı — aksi halde kullanıcı X'e basarsa her dashboard ziyaretinde
  // tur yeniden açılırdı.
  function handleOpenChange(next: boolean) {
    if (!next) finish();
    else setOpen(next);
  }

  const isLast = step === ONBOARDING_STEPS.length - 1;
  const current = ONBOARDING_STEPS[step];
  const Icon = current.icon;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center sm:text-center">
          <div className="mb-1 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-8 w-8" />
          </div>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription>{current.description}</DialogDescription>
        </DialogHeader>

        {/* İlerleme noktaları */}
        <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
          {ONBOARDING_STEPS.map((s, i) => (
            <span
              key={s.title}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === step ? 'w-5 bg-primary' : 'w-1.5 bg-muted',
              )}
            />
          ))}
        </div>
        <p className="sr-only" role="status">
          Adım {step + 1} / {ONBOARDING_STEPS.length}
        </p>

        <DialogFooter className="mt-2 flex-row items-center justify-between sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={finish}>
            Atla
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => s - 1)}
              >
                Geri
              </Button>
            )}
            {isLast ? (
              <Button type="button" size="sm" onClick={finish}>
                Başla
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={() => setStep((s) => s + 1)}>
                İleri
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
