import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'StokPilot Admin Dashboard',
  description: 'Multi-tenant inventory management admin dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ fontFamily: 'sans-serif' }}>
          <header style={{ background: '#f5f5f5', padding: '20px', borderBottom: '1px solid #ddd' }}>
            <h1>🏢 StokPilot Admin Dashboard</h1>
          </header>
          <main style={{ padding: '20px' }}>
            {children}
          </main>
          <footer style={{ marginTop: '40px', padding: '20px', borderTop: '1px solid #ddd', textAlign: 'center', color: '#666' }}>
            <p>© 2026 StokPilot. Multi-tenant SaaS for inventory management.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
