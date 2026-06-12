export default function Page() {
  return (
    <div>
      <h2>Welcome to StokPilot Supplier Portal</h2>
      
      <section style={{ marginTop: '30px' }}>
        <h3>Supplier Functions</h3>
        <ul>
          <li><a href="/products">My Products</a></li>
          <li><a href="/orders">Orders</a></li>
          <li><a href="/shipments">Shipments</a></li>
          <li><a href="/analytics">Analytics</a></li>
          <li><a href="/profile">Profile</a></li>
        </ul>
      </section>

      <section style={{ marginTop: '30px', padding: '20px', background: '#f9f9f9', borderRadius: '4px' }}>
        <h3>Portal Features</h3>
        <ul>
          <li>✅ Product catalog management</li>
          <li>✅ Order management</li>
          <li>✅ Shipment tracking</li>
          <li>✅ Performance metrics</li>
          <li>✅ Document management</li>
        </ul>
      </section>

      <section style={{ marginTop: '30px' }}>
        <h3>Support</h3>
        <p>Need help? Contact our support team at <a href="mailto:support@stokpilot.com">support@stokpilot.com</a></p>
      </section>
    </div>
  );
}
