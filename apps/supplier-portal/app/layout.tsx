import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'StokPilot Supplier Portal',
  description: 'Multi-tenant supplier management portal',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ fontFamily: 'sans-serif' }}>
          <header style={{ background: '#f5f5f5', padding: '20px', borderBottom: '1px solid #ddd' }}>
            <h1>📦 StokPilot Supplier Portal</h1>
          </header>
          <main style={{ padding: '20px' }}>
            {children}
          </main>
          <footer style={{ marginTop: '40px', padding: '20px', borderTop: '1px solid #ddd', textAlign: 'center', color: '#666' }}>
            <p>© 2026 StokPilot. Supplier Portal.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
