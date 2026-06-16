import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-2xl font-bold">
          SP
        </div>
        <h1 className="text-3xl font-bold tracking-tight">StokPilot</h1>
        <p className="mt-2 text-muted-foreground">
          Multi-tenant envanter yönetim sistemi
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild>
            <Link href="/login">Giriş Yap</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
