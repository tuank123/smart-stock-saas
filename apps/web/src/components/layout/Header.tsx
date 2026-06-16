'use client';

import { LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuthStore } from '@/store/auth.store';
import { useAuth } from '@/hooks/useAuth';

export function Header({ title }: { title?: string }) {
  const { user } = useAuthStore();
  const { logout, isLoggingOut } = useAuth();

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'SP';

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4 lg:px-6">
      <h1 className="text-base font-semibold text-foreground">
        {title ?? 'StokPilot'}
      </h1>

      <div className="flex items-center gap-3">
        {user && (
          <div className="hidden flex-col text-right text-xs sm:flex">
            <span className="font-medium">{user.email}</span>
            <span className="text-muted-foreground">{user.role ?? 'Rol atanmadı'}</span>
          </div>
        )}

        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => logout()}
          disabled={isLoggingOut}
          title="Çıkış yap"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
