'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/hooks/useSettings';
import { useUpdateTenant } from '@/hooks/useMudur';

export default function IsletmeBilgileriPage() {
  const { data: me, isPending } = useMe();
  const updateTenant = useUpdateTenant();

  const [companyName, setCompanyName] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [init, setInit] = useState(false);

  useEffect(() => {
    if (me?.tenant && !init) {
      setCompanyName(me.tenant.companyName ?? '');
      setTaxNumber(me.tenant.taxNumber ?? '');
      setInit(true);
    }
  }, [me, init]);

  function handleSave() {
    if (!companyName.trim()) {
      toast.error('Firma adı zorunludur');
      return;
    }
    updateTenant.mutate({ companyName: companyName.trim(), taxNumber: taxNumber.trim() });
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="İşletme Bilgileri" />

      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="companyName">Firma Adı *</Label>
            <Input
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="taxNumber">Vergi Numarası</Label>
            <Input
              id="taxNumber"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
            />
          </div>
          <Button onClick={handleSave} disabled={updateTenant.isPending}>
            {updateTenant.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      )}
    </div>
  );
}
