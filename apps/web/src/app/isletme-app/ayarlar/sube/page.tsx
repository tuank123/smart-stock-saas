'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { StationPageHeader } from '@/components/layout/StationPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranchDetail, useUpdateBranch } from '@/hooks/useMudur';

export default function SubeBilgileriPage() {
  const { data: branch, isPending } = useBranchDetail();
  const updateBranch = useUpdateBranch();

  const [branchName, setBranchName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [init, setInit] = useState(false);

  useEffect(() => {
    if (branch && !init) {
      setBranchName(branch.name ?? '');
      setAddress(branch.address ?? '');
      setPhone(branch.phone ?? '');
      setInit(true);
    }
  }, [branch, init]);

  function handleSave() {
    if (!branchName.trim()) {
      toast.error('Şube adı zorunludur');
      return;
    }
    updateBranch.mutate({
      name: branchName.trim(),
      address: address.trim() || undefined,
      phone: phone.trim() || undefined,
    });
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <StationPageHeader title="Şube Bilgileri" />

      {isPending ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="branchName">Şube Adı *</Label>
            <Input
              id="branchName"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Adres</Label>
            <textarea
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefon</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <Button onClick={handleSave} disabled={updateBranch.isPending}>
            {updateBranch.isPending ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      )}
    </div>
  );
}
