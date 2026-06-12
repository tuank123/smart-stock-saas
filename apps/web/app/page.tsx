export default function Page() {
  return (
    <div>
      <h2>Welcome to StokPilot Admin Dashboard</h2>
      
      <section style={{ marginTop: '30px' }}>
        <h3>Quick Links</h3>
        <ul>
          <li><a href="/dashboard">Dashboard</a></li>
          <li><a href="/users">Users</a></li>
          <li><a href="/branches">Branches</a></li>
          <li><a href="/inventory">Inventory</a></li>
          <li><a href="/settings">Settings</a></li>
        </ul>
      </section>

      <section style={{ marginTop: '30px', padding: '20px', background: '#f9f9f9', borderRadius: '4px' }}>
        <h3>Features</h3>
        <ul>
          <li>✅ Multi-tenant architecture</li>
          <li>✅ User management</li>
          <li>✅ Branch management</li>
          <li>✅ Inventory tracking</li>
          <li>✅ Real-time analytics</li>
        </ul>
      </section>

      <section style={{ marginTop: '30px' }}>
        <h3>API Status</h3>
        <p>Backend running at: <code>http://localhost:3000/api/v1</code></p>
        <p>Check out the <a href="http://localhost:3000/api/v1" target="_blank" rel="noopener noreferrer">API documentation</a></p>
      </section>
    </div>
  );
}
