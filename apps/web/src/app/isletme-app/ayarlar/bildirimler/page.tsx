'use client';

import { useEffect, useState } from 'react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { useBranchDetail, useUpdateBranch } from '@/hooks/useMudur';
import { cn } from '@/lib/utils';

// shadcn Switch bileşeni projede olmadığı için sade bir toggle.
function Toggle({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export default function BildirimlerPage() {
  const { data: branch, isPending } = useBranchDetail();
  const updateBranch = useUpdateBranch();

  const [enabled, setEnabled] = useState(true);
  const [init, setInit] = useState(false);

  useEffect(() => {
    if (branch && !init) {
      setEnabled(branch.debtRemindersEnabled);
      setInit(true);
    }
  }, [branch, init]);

  function handleToggle(next: boolean) {
    setEnabled(next); // anında görsel geri bildirim
    updateBranch.mutate({ debtRemindersEnabled: next });
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Bildirim Tercihleri" />

      {isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="debt-reminders" className="text-base">
              Alacak Verecek Hatırlatmaları
            </Label>
            <Toggle
              id="debt-reminders"
              checked={enabled}
              onChange={handleToggle}
              disabled={updateBranch.isPending}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Kapatırsanız, 2 gün ziyaret edilmeyen kayıtlar ve 15 günlük alacak
            hatırlatmaları gösterilmez.
          </p>
        </div>
      )}
    </div>
  );
}
