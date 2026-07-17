'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, Phone, MapPin, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

import { PageLayout } from '@/components/layout/PageLayout';
import { PageTabs } from '@/components/layout/PageTabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import type { Branch, BranchIntegration } from '@/lib/types';

// ── API helpers ───────────────────────────────────────────────────────────────

function fetchBranches(): Promise<Branch[]> {
  return api.get<Branch[]>('/branches').then((r) => r.data);
}
function fetchIntegration(id: string): Promise<BranchIntegration | null> {
  return api.get<BranchIntegration>(`/branches/${id}/integration`)
    .then((r) => r.data)
    .catch((): null => null);
}

// ── Create branch modal ───────────────────────────────────────────────────────

function toSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

interface CreateBranchModalProps {
  open: boolean;
  onClose: () => void;
}

function CreateBranchModal({ open, onClose }: CreateBranchModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', slug: '', address: '', phone: '' });

  useEffect(() => {
    if (!open) setForm({ name: '', slug: '', address: '', phone: '' });
  }, [open]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setForm((f) => ({ ...f, name, slug: toSlug(name) }));
  };

  const mutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/branches', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] });
      toast.success('Şube oluşturuldu');
      onClose();
    },
    onError: () => toast.error('Şube oluşturulamadı'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Yeni Şube</DialogTitle>
          <DialogDescription>
            Şube bilgilerini doldurun. Slug otomatik oluşturulur.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Şube Adı *</Label>
            <Input id="name" required value={form.name} onChange={handleNameChange} placeholder="İstanbul Merkez" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" value={form.slug} onChange={set('slug')} placeholder="istanbul-merkez" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Adres</Label>
            <Input id="address" value={form.address} onChange={set('address')} placeholder="Bağcılar, İstanbul" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefon</Label>
            <Input id="phone" value={form.phone} onChange={set('phone')} placeholder="+90 212 000 00 00" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>İptal</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Oluşturuluyor…' : 'Oluştur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Branch card ───────────────────────────────────────────────────────────────

interface BranchCardProps {
  branch: Branch;
  integration: BranchIntegration | null;
  integrationLoading: boolean;
  onClick: () => void;
}

function BranchCard({ branch, integration, integrationLoading, onClick }: BranchCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border bg-card text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold">{branch.name}</p>
              <p className="text-xs text-muted-foreground">{branch.slug}</p>
            </div>
          </div>

          <Badge variant={branch.isActive ? 'default' : 'secondary'} className="shrink-0 text-xs">
            {branch.isActive ? 'Aktif' : 'Pasif'}
          </Badge>
        </div>

        <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          {branch.address && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{branch.address}</span>
            </div>
          )}
          {branch.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span>{branch.phone}</span>
            </div>
          )}
        </div>

        <div className="mt-3">
          {integrationLoading ? (
            <Skeleton className="h-5 w-24" />
          ) : integration ? (
            <Badge variant="outline" className="flex w-fit items-center gap-1 text-xs text-green-700 border-green-300">
              <Wifi className="h-3 w-3" />
              {integration.adapterType}
            </Badge>
          ) : (
            <Badge variant="outline" className="flex w-fit items-center gap-1 text-xs text-muted-foreground">
              <WifiOff className="h-3 w-3" />
              Entegrasyon yok
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  const branchesQuery = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: fetchBranches,
  });

  const branches = branchesQuery.data ?? [];

  const integrationQueries = useQueries({
    queries: branches.map((b: Branch) => ({
      queryKey: ['branches', b.id, 'integration'],
      queryFn: () => fetchIntegration(b.id),
      enabled: branchesQuery.isSuccess,
      staleTime: 1000 * 60 * 5,
    })),
  });

  return (
    <PageLayout title="Şubeler">
      <PageTabs
        tabs={[
          { href: '/branches', label: 'Şubeler' },
          { href: '/stock', label: 'Stok' },
          { href: '/products', label: 'Ürünler' },
        ]}
      />
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {branchesQuery.isSuccess ? `${branches.length} şube` : ' '}
        </p>
        <Button onClick={() => setModalOpen(true)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Yeni Şube
        </Button>
      </div>

      {branchesQuery.isError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Şubeler yüklenirken hata oluştu.</p>
        </div>
      )}

      {branchesQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      ) : branches.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Henüz şube eklenmemiş.</p>
          <Button className="mt-4" size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            İlk Şubeyi Ekle
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((b: Branch, i: number) => (
            <BranchCard
              key={b.id}
              branch={b}
              integration={(integrationQueries[i]?.data as BranchIntegration | null | undefined) ?? null}
              integrationLoading={integrationQueries[i]?.isPending ?? false}
              onClick={() => router.push(`/branches/detay?id=${b.id}`)}
            />
          ))}
        </div>
      )}

      <CreateBranchModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </PageLayout>
  );
}
