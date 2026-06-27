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
  maxThreshold?: string | number | null;
  product: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    barcode?: string | null;
    unitsPerCase?: number | null;
  };
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

// ── Report detail (GET /reports/:id) ─────────────────────────────────────────

interface DailyBranchStat {
  branchId: string;
  branchName: string;
  totalOrders: number;
  approvedOrdersValue: number;
  criticalStockCount: number;
  stockMovementsIn: number;
  stockMovementsOut: number;
}

interface DailyTotals {
  totalOrders: number;
  totalApprovedValue: number;
  totalCriticalStock: number;
  totalMovementsIn: number;
  totalMovementsOut: number;
}

interface PriceAnomaly {
  id: string;
  productId: string;
  oldPrice: number;
  newPrice: number;
  changePct: number;
  anomalyFlag: boolean;
  createdAt: string;
}

export interface DailyPayload {
  date: string;
  branches: DailyBranchStat[];
  totals: DailyTotals;
  anomalies: PriceAnomaly[];
}

interface MonthlyBranchStat {
  branchId: string;
  branchName: string;
  orderCount: number;
  stockMovementCount: number;
  criticalStockCount: number;
}

interface MonthlyTotals {
  totalOrders: number;
  totalMovements: number;
  priceAnomalies: number;
}

export interface MonthlyPayload {
  year: number;
  month: number;
  period: string;
  branchComparison: MonthlyBranchStat[];
  totals: MonthlyTotals;
  dailyReportCount: number;
}

export interface ReportDetail extends Report {
  payload: DailyPayload | MonthlyPayload;
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

// ── Orders ────────────────────────────────────────────────────────────────────

export interface OrderItem {
  id: string;
  poId: string;
  productId: string;
  quantityOrdered: string | number;
  quantityReceived: string | number;
  unitPrice?: string | number | null;
  notes?: string | null;
  product: { id: string; sku: string; name: string; unit: string; unitsPerCase?: number | null };
}

export interface Order {
  id: string;
  tenantId: string;
  branchId: string;
  supplierId: string;
  status: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: { id: string; name: string; whatsappNumber: string };
  branch: { id: string; name: string };
  approver?: { id: string; email: string } | null;
  items: OrderItem[];
}

// ── Transfers ─────────────────────────────────────────────────────────────────

export interface Transfer {
  id: string;
  tenantId: string;
  fromBranchId: string;
  toBranchId: string;
  productId: string;
  quantity: string | number;
  status: string;
  notes?: string | null;
  createdAt: string;
  fromBranch: { id: string; name: string };
  toBranch: { id: string; name: string };
  product: { id: string; sku: string; name: string; unit: string };
  requester: { id: string; email: string };
  approver?: { id: string; email: string } | null;
  dispatcher?: { id: string; email: string } | null;
  receiver?: { id: string; email: string } | null;
}

// ── Suppliers ─────────────────────────────────────────────────────────────────

export interface BranchSupplierLink {
  id: string;
  supplierId: string;
  branchId: string;
  isPrimary: boolean;
  notes?: string | null;
  branch: { id: string; name: string };
}

export interface Supplier {
  id: string;
  tenantId: string;
  name: string;
  contactName?: string | null;
  whatsappNumber: string;
  otpVerified: boolean;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  branchSuppliers: BranchSupplierLink[];
}

// ── WhatsApp logs ─────────────────────────────────────────────────────────────

export interface WhatsappLog {
  id: string;
  messageBody: string;
  whatsappNumber: string;
  status: string;
  sentAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

// Branch augmented with per-branch dashboard data
export interface BranchDashboardRow extends Branch {
  criticalStockCount: number;
  draftOrderCount: number;
  integration: BranchIntegration | null;
}

// ── Personnel ─────────────────────────────────────────────────────────────────

export type UserRole = 'SUPER_ADMIN' | 'PATRON' | 'SUBE_MUDURU' | 'KASIYER' | 'DEPO';

export interface BranchUser {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole | null;
  isActive: boolean;
  createdAt: string;
}

export interface PendingRegistration {
  id: string;
  tenantId: string;
  branchId: string;
  token: string;
  applicantName: string;
  applicantEmail: string;
  status: string;
  createdUserId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  usedAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
}

// ── Price updates (supplier portal uploads) ──────────────────────────────────

// GET /portal/uploads/:branchId — pending price-update uploads
export interface PendingPriceUpload {
  id: string;
  tenantId: string;
  branchId: string;
  supplierId: string | null;
  portalId: string;
  uploaderPhone: string;
  pdfUrl: string;
  ocrExtractedFirm: string | null;
  ocrExtractedPhone: string | null;
  uploadType: string;
  status: string;
  createdAt: string;
  supplier: { id: string; name: string } | null;
}

// One parsed line item within a PendingPriceUpload.parsedItems blob
export interface ParsedPriceItem {
  productId: string;
  productName: string;
  oldPrice: number | null;
  newPrice: number;
  discountPct: number | null;
}

// GET /portal/uploads/detail/:uploadId — single upload with parsed items
export interface PriceUploadDetail extends PendingPriceUpload {
  parsedItems: ParsedPriceItem[] | null;
}

// GET /stock/price-changes/:branchId — price change history
export interface PriceChange {
  id: string;
  productId: string;
  branchId: string | null;
  oldPrice: string | number;
  newPrice: string | number;
  changePct: string | number;
  anomalyFlag: boolean;
  createdAt: string;
  product: { id: string; sku: string; name: string };
  changer: { id: string; email: string };
}
