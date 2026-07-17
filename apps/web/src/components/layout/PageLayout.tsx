import { type ReactNode } from 'react';
import { Header } from './Header';
import { PatronBottomNav } from './PatronBottomNav';

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
}

export function PageLayout({ children, title }: PageLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto p-4 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:p-6 lg:pb-[calc(4rem+env(safe-area-inset-bottom))]">
          {children}
        </main>
      </div>
      <PatronBottomNav />
    </div>
  );
}
