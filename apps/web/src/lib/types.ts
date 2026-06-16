export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  address?: string | null;
  phone?: string | null;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  deletedAt?: string | null;
}

export interface BranchIntegration {
  id: string;
  branchId: string;
  adapterType: string;
  agentId?: string | null;
  agentVersion?: string | null;
  webserviceUrl?: string | null;
}

// StockLevel with product relation (returned by GET /stock/:branchId)
export interface StockLevel {
  id: string;
  branchId: string;
  productId: string;
  quantity: string | number;
  minThreshold: string | number;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    barcode?: string | null;
  };
}

// Order (draft) returned by GET /orders/draft/:branchId
export interface Order {
  id: string;
  branchId: string;
  tenantId: string;
  status: string;
  createdAt: string;
  supplierId?: string | null;
}

// Report returned by GET /reports
export interface Report {
  id: string;
  reportType: string;
  reportDate: string;
  generatedAt: string;
  isRead: boolean;
  readAt?: string | null;
  pdfUrl?: string | null;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId: string;
  sku: string;
  barcode?: string | null;
  name: string;
  unit: string;
  imageUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  category: { id: string; name: string };
}

// Branch augmented with per-branch dashboard data
export interface BranchDashboardRow extends Branch {
  criticalStockCount: number;
  draftOrderCount: number;
  integration: BranchIntegration | null;
}
