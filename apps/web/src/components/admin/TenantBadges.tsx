import { Badge } from '@/components/ui/badge';

export function StatusBadge({ status }: { status: string }) {
  if (status === 'ACTIVE')
    return <Badge className="border-green-200 bg-green-100 text-green-800 hover:bg-green-100">Aktif</Badge>;
  if (status === 'SUSPENDED')
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
        Askıda
      </Badge>
    );
  return <Badge className="border-red-200 bg-red-100 text-red-800 hover:bg-red-100">Silinmiş</Badge>;
}

export function PlanBadge({ planId }: { planId: string }) {
  return (
    <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-700">
      {planId}
    </Badge>
  );
}
