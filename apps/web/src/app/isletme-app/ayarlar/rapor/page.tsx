'use client';

import { useEffect, useState } from 'react';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranchDetail, useUpdateBranch } from '@/hooks/useMudur';

export default function RaporAyarlariPage() {
  const { data: branch, isPending } = useBranchDetail();
  const updateBranch = useUpdateBranch();

  const [closingTime, setClosingTime] = useState('00:00');
  const [init, setInit] = useState(false);

  useEffect(() => {
    if (branch && !init) {
      setClosingTime(branch.closingTime ?? '00:00');
      setInit(true);
    }
  }, [branch, init]);

  function handleSave() {
    updateBranch.mutate({ closingTime });
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Rapor Ayarları" />

      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="closingTime">Kapanış Saati</Label>
            <input
              id="closingTime"
              type="time"
              value={closingTime}
              onChange={(e) => setClosingTime(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">
              Günlük rapor, bu saatte başlayan/biten iş gününe göre hesaplanır.
            </p>
          </div>
          <Button onClick={handleSave} disabled={updateBranch.isPending}>
            {updateBranch.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      )}
    </div>
  );
}
