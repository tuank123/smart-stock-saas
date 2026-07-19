'use client';

import { useState } from 'react';
import { Copy, Pencil, UserPlus, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAssignRole,
  useBranchUsers,
  useGenerateRegistrationCode,
} from '@/hooks/useMudur';
import type { BranchUser, UserRole } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/roleLabels';

// ── Badges ────────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { label: string; className: string }> = {
  SUBE_MUDURU: { label: ROLE_LABELS.SUBE_MUDURU, className: 'border-blue-200 bg-blue-100 text-blue-700' },
  KASIYER: { label: ROLE_LABELS.KASIYER, className: 'border-green-200 bg-green-100 text-green-700' },
  DEPO: { label: ROLE_LABELS.DEPO, className: 'border-orange-200 bg-orange-100 text-orange-700' },
};

function RoleBadge({ role }: { role: UserRole | null }) {
  if (!role) {
    return (
      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-xs text-muted-foreground">
        Rol Atanmadı
      </Badge>
    );
  }
  const cfg = ROLE_CONFIG[role];
  if (!cfg) return null;
  return (
    <Badge variant="outline" className={`text-xs ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge variant="outline" className="border-green-200 bg-green-100 text-xs text-green-700">
      Aktif
    </Badge>
  ) : (
    <Badge variant="outline" className="border-red-200 bg-red-100 text-xs text-red-700">
      Pasif
    </Badge>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(dateStr));
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
        </div>
        <Skeleton className="mt-3 h-8 w-28" />
      </CardContent>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ── Role edit row ─────────────────────────────────────────────────────────────

function RoleEditCell({ user }: { user: BranchUser }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<'KASIYER' | 'DEPO'>(
    user.role === 'DEPO' ? 'DEPO' : 'KASIYER',
  );
  const assignRole = useAssignRole();

  // Managers aren't reassigned from here; everyone else (KASIYER / DEPO /
  // not-yet-assigned) can get a role.
  if (user.role === 'SUBE_MUDURU') return null;

  if (!editing) {
    return (
      <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={() => setEditing(true)}>
        <Pencil className="h-3.5 w-3.5" />
        {user.role ? 'Rol Değiştir' : 'Rol Ata'}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Select value={role} onValueChange={(v) => setRole(v as 'KASIYER' | 'DEPO')}>
        <SelectTrigger className="h-9 w-full text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="KASIYER">Şube Görevlisi</SelectItem>
          <SelectItem value="DEPO">Depo Görevlisi</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="h-9 flex-1"
          disabled={assignRole.isPending}
          onClick={() =>
            assignRole.mutate(
              { userId: user.id, role },
              { onSuccess: () => setEditing(false) },
            )
          }
        >
          Kaydet
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 flex-1"
          disabled={assignRole.isPending}
          onClick={() => setEditing(false)}
        >
          Vazgeç
        </Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MudurPersonelPage() {
  const { data: users, isPending: usersLoading, isError: usersError } = useBranchUsers();
  const generateCode = useGenerateRegistrationCode();

  const [codeOpen, setCodeOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');

  const staff = users ?? [];

  function handleGenerate() {
    generateCode.mutate(undefined, {
      onSuccess: (data) => {
        setGeneratedCode(data.token);
        setCodeOpen(true);
      },
      onError: () => toast.error('Kod oluşturulamadı'),
    });
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(generatedCode);
      toast.success('Kod kopyalandı');
    } catch {
      toast.error('Kopyalanamadı');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Personel</h1>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={generateCode.isPending}
          onClick={handleGenerate}
        >
          <UserPlus className="h-4 w-4" />
          {generateCode.isPending ? 'Oluşturuluyor…' : 'Yeni Çalışan Ekle'}
        </Button>
      </div>

      {usersError && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Personel listesi yüklenirken hata oluştu.
        </div>
      )}

      {usersLoading ? (
        <ListSkeleton />
      ) : staff.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-12 text-center">
          <Users className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Henüz personel bulunmuyor.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {staff.map((user: BranchUser) => (
            <Card key={user.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    {user.fullName ? (
                      <>
                        <p className="truncate font-medium">{user.fullName}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      </>
                    ) : (
                      <p className="truncate font-medium">{user.email}</p>
                    )}
                    <p className="pt-0.5 text-xs text-muted-foreground">
                      Katılım: {fmt(user.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <RoleBadge role={user.role} />
                    <StatusBadge isActive={user.isActive} />
                  </div>
                </div>

                <RoleEditCell user={user} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Yeni çalışan kayıt kodu */}
      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yeni Çalışan Kodu</DialogTitle>
            <DialogDescription>
              Bu kodu yeni çalışana ilet, mobil uygulamadan &quot;Kayıt Ol&quot; ekranında bu kodu
              kullanarak hesap oluşturabilir.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <div className="select-all rounded-xl border bg-muted/40 px-6 py-4 font-mono text-3xl font-bold tracking-[0.3em]">
              {generatedCode}
            </div>
            <Button variant="outline" className="gap-1.5" onClick={copyCode}>
              <Copy className="h-4 w-4" />
              Kopyala
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
