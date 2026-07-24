'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type {
  StockLevel,
  Order,
  Transfer,
  Branch,
  Supplier,
  BranchUser,
  PendingPriceUpload,
  PriceChange,
  PriceUploadDetail,
} from '@/lib/types';

// ── OCR types (exported for the OCR page) ────────────────────────────────────

export interface OcrParsedLine {
  name: string;
  qty: number;
  unit: string;
  confidence: number;
  matchStatus: 'AUTO_MATCHED' | 'UNMATCHED';
  matchedProductId?: string | null;
}

export interface OcrScanResult {
  scanId: string;
  parsedLines: OcrParsedLine[];
}

// ── API types ─────────────────────────────────────────────────────────────────

export interface BranchDetail {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  address: string | null;
  integrationStatus: string | null;
}

export interface StockMovement {
  id: string;
  productId: string;
  branchId: string;
  movementType: string;
  quantity: string | number;
  referenceId?: string | null;
  referenceType?: string | null;
  notes?: string | null;
  createdAt: string;
  product: { id: string; sku: string; name: string; unit: string };
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

function fetchBranchDetail(branchId: string): Promise<BranchDetail> {
  return api.get<BranchDetail>(`/branches/${branchId}`).then((r) => r.data);
}

function fetchCriticalStock(branchId: string): Promise<StockLevel[]> {
  return api
    .get<StockLevel[]>(`/stock/${branchId}`, { params: { critical: true } })
    .then((r) => r.data);
}

function fetchDraftOrders(branchId: string): Promise<Order[]> {
  return api.get<Order[]>(`/orders/draft/${branchId}`).then((r) => r.data);
}

function fetchTransfers(branchId: string): Promise<Transfer[]> {
  return api.get<Transfer[]>(`/transfers/${branchId}`).then((r) => r.data);
}

function fetchStockList(branchId: string): Promise<StockLevel[]> {
  return api.get<StockLevel[]>(`/stock/${branchId}`).then((r) => r.data);
}

function fetchStockDetail(branchId: string, productId: string): Promise<StockLevel> {
  return api.get<StockLevel>(`/stock/${branchId}/${productId}`).then((r) => r.data);
}

function fetchStockMovements(branchId: string): Promise<StockMovement[]> {
  return api.get<StockMovement[]>(`/stock/movements/${branchId}`).then((r) => r.data);
}

function fetchBranches(): Promise<Branch[]> {
  return api.get<Branch[]>('/branches').then((r) => r.data);
}

// ── Dashboard hooks ───────────────────────────────────────────────────────────

export function useBranchDetail() {
  const { user } = useAuthStore();
  return useQuery<BranchDetail>({
    queryKey: ['branch', user?.branchId],
    queryFn: () => fetchBranchDetail(user!.branchId!),
    staleTime: 1000 * 60 * 5,
    enabled: !!user?.branchId,
  });
}

export function useMudurDashboard() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';

  const branchQuery = useQuery<BranchDetail>({
    queryKey: ['branch', branchId],
    queryFn: () => fetchBranchDetail(branchId),
    staleTime: 1000 * 60 * 5,
    enabled: !!branchId,
  });

  const stockQuery = useQuery<StockLevel[]>({
    queryKey: ['stock', 'critical', branchId],
    queryFn: () => fetchCriticalStock(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });

  const ordersQuery = useQuery<Order[]>({
    queryKey: ['orders', 'draft', branchId],
    queryFn: () => fetchDraftOrders(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });

  const transfersQuery = useQuery<Transfer[]>({
    queryKey: ['transfers', branchId],
    queryFn: () => fetchTransfers(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });

  const isLoading =
    branchQuery.isPending ||
    stockQuery.isPending ||
    ordersQuery.isPending ||
    transfersQuery.isPending;

  const isError =
    branchQuery.isError ||
    stockQuery.isError ||
    ordersQuery.isError ||
    transfersQuery.isError;

  return {
    branch: branchQuery.data ?? null,
    criticalStockCount: stockQuery.data?.length ?? 0,
    draftOrderCount: ordersQuery.data?.length ?? 0,
    requestedTransferCount:
      transfersQuery.data?.filter((t: Transfer) => t.status === 'REQUESTED').length ?? 0,
    isLoading,
    isError,
  };
}

// ── Stock hooks ───────────────────────────────────────────────────────────────

export function useStockList() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<StockLevel[]>({
    queryKey: ['stock', branchId],
    queryFn: () => fetchStockList(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });
}

export function useStockDetail(productId: string) {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<StockLevel>({
    queryKey: ['stock', branchId, productId],
    queryFn: () => fetchStockDetail(branchId, productId),
    staleTime: 1000 * 30,
    enabled: !!branchId && !!productId,
  });
}

// Product-name lookup for the KASIYER station screen — sends `search`, which
// the backend matches against product.name (case-insensitive contains).
// Returns [] when nothing matches. Short staleTime so results stay fresh.
export function useStockQuery(query: string | null, isBarcode: boolean = false) {
  return useQuery<StockLevel[]>({
    queryKey: ['stock', 'query', query, isBarcode],
    queryFn: () =>
      api
        .get<StockLevel[]>('/stock/query', {
          params: isBarcode ? { barcode: query } : { search: query },
        })
        .then((r) => r.data),
    enabled: !!query,
    staleTime: 1000 * 2,
  });
}

// Geçici Kasa — sepet bazlı satış. Başarıda stok cache'ini tazeler.
function saleErrorMessage(err: unknown): string {
  const m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) return m.join(', ');
  return 'Satış kaydedilemedi';
}

export function useRecordSale() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      items: { productId: string; quantity: number }[];
      paymentMethod: string;
      customerPhone?: string;
    }) => api.post(`/stock/${branchId}/sale`, dto).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      toast.success('Satış tamamlandı');
    },
    onError: (err: unknown) => toast.error(saleErrorMessage(err)),
  });
}

export function useStockMovements() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<StockMovement[]>({
    queryKey: ['stock', 'movements', branchId],
    queryFn: () => fetchStockMovements(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });
}

export function useUpdateThreshold() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      productId: string;
      data: { minThreshold?: number; maxThreshold?: number };
    }) =>
      api
        .patch(`/stock/${branchId}/${vars.productId}/threshold`, vars.data)
        .then((r) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['stock', branchId] });
      qc.invalidateQueries({ queryKey: ['stock', branchId, vars.productId] });
      toast.success('Eşik değerleri güncellendi');
    },
    onError: () => toast.error('Eşik güncellenemedi'),
  });
}

export function useWaste() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { productId: string; quantity: number; reason: string; photoBase64: string }) =>
      api.post(`/stock/${branchId}/waste`, dto).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock', branchId] });
      qc.invalidateQueries({ queryKey: ['stock', 'movements', branchId] });
      toast.success('Fire kaydedildi');
    },
    onError: () => toast.error('Fire kaydedilemedi'),
  });
}

export function useCreateTransfer() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      fromBranchId: string;
      toBranchId: string;
      productId: string;
      quantity: number;
      notes?: string;
    }) => api.post('/transfers', dto).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers', branchId] });
      toast.success('Transfer talebi oluşturuldu');
    },
    onError: () => toast.error('Transfer oluşturulamadı'),
  });
}

export function useBranches() {
  return useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: fetchBranches,
    staleTime: 1000 * 60 * 5,
  });
}

// ── Order hooks ───────────────────────────────────────────────────────────────

function fetchAllOrders(branchId: string): Promise<Order[]> {
  return api.get<Order[]>(`/orders/${branchId}`).then((r) => r.data);
}

// Depo istasyonu — yalnızca teslim alınabilir (APPROVED/SENT) siparişler.
function fetchStationOrders(branchId: string): Promise<Order[]> {
  return api.get<Order[]>(`/orders/station/${branchId}`).then((r) => r.data);
}

function fetchSuppliers(): Promise<Supplier[]> {
  return api.get<Supplier[]>('/suppliers').then((r) => r.data);
}

export function useOrders() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<Order[]>({
    queryKey: ['orders', branchId],
    queryFn: () => fetchAllOrders(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });
}

export function useDraftOrders() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<Order[]>({
    queryKey: ['orders', 'draft', branchId],
    queryFn: () => fetchDraftOrders(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });
}

// Depo istasyonu için teslim alınabilir siparişler (APPROVED/SENT).
export function useStationOrders() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<Order[]>({
    queryKey: ['orders', 'station', branchId],
    queryFn: () => fetchStationOrders(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });
}

export function useReceiveOrder() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      orderId: string;
      notes?: string;
      items?: Array<{ productId: string; quantityReceived: number }>;
    }) =>
      api
        .patch(`/orders/${vars.orderId}/receive`, {
          notes: vars.notes,
          items: vars.items,
        })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders', 'station', branchId] });
      qc.invalidateQueries({ queryKey: ['stock', branchId] });
      qc.invalidateQueries({ queryKey: ['stock', 'movements', branchId] });
      toast.success('Sipariş teslim alındı');
    },
    onError: () => toast.error('Teslim alma başarısız'),
  });
}

export function useApproveOrder() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) =>
      api.patch(`/orders/${orderId}/approve`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders', branchId] });
      qc.invalidateQueries({ queryKey: ['orders', 'draft', branchId] });
      toast.success('Sipariş onaylandı');
    },
    onError: () => toast.error('Sipariş onaylanamadı'),
  });
}

export function useCancelOrder() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) =>
      api.patch(`/orders/${orderId}/cancel`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders', branchId] });
      qc.invalidateQueries({ queryKey: ['orders', 'draft', branchId] });
      toast.success('Sipariş iptal edildi');
    },
    onError: () => toast.error('Sipariş iptal edilemedi'),
  });
}

export function useCreateOrder() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: {
      branchId: string;
      supplierId: string;
      items: Array<{ productId: string; quantity: number }>;
      notes?: string;
    }) => api.post('/orders', dto).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders', branchId] });
      qc.invalidateQueries({ queryKey: ['orders', 'draft', branchId] });
      toast.success('Sipariş oluşturuldu');
    },
    onError: () => toast.error('Sipariş oluşturulamadı'),
  });
}

export function useSuppliers() {
  return useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: fetchSuppliers,
    staleTime: 1000 * 60 * 5,
  });
}

export function useSupplierDetail(supplierId: string) {
  return useQuery<Supplier>({
    queryKey: ['suppliers', supplierId],
    queryFn: () => api.get<Supplier>(`/suppliers/${supplierId}`).then((r) => r.data),
    staleTime: 1000 * 60 * 5,
    enabled: !!supplierId,
  });
}

export function useCreateSupplier() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: {
      name: string;
      contactName?: string;
      whatsappNumber: string;
      notes?: string;
    }) => {
      const supplier = await api.post<Supplier>('/suppliers', dto).then((r) => r.data);
      if (branchId) {
        await api.post(`/suppliers/${supplier.id}/branches/${branchId}`, { isPrimary: true });
      }
      return supplier;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Tedarikçi eklendi');
    },
    onError: () => toast.error('Tedarikçi eklenemedi'),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      supplierId: string;
      data: { name?: string; contactName?: string; whatsappNumber?: string; notes?: string };
    }) => api.patch(`/suppliers/${vars.supplierId}`, vars.data).then((r) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['suppliers', vars.supplierId] });
      toast.success('Tedarikçi güncellendi');
    },
    onError: () => toast.error('Tedarikçi güncellenemedi'),
  });
}

export function useOrderDetail(orderId: string) {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  // Select from the shared draft-orders cache — no extra network request when cache is warm
  return useQuery<Order[], Error, Order | null>({
    queryKey: ['orders', 'draft', branchId],
    queryFn: () => fetchDraftOrders(branchId),
    select: (orders: Order[]) => orders.find((o: Order) => o.id === orderId) ?? null,
    staleTime: 1000 * 30,
    enabled: !!branchId && !!orderId,
  });
}

export function useUpdateUnitsPerCase() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { productId: string; unitsPerCase: number }) =>
      api
        .patch(`/products/${vars.productId}/units-per-case`, { unitsPerCase: vars.unitsPerCase })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock', branchId] });
    },
    onError: () => toast.error('Koli bilgisi güncellenemedi'),
  });
}

export function useOcrScan() {
  return useMutation({
    mutationFn: (dto: { branchId: string; imageBase64?: string }) =>
      api.post<OcrScanResult>('/ocr/scan', dto).then((r) => r.data),
    onError: () => toast.error('Fatura taranamadı'),
  });
}

export function useOcrConfirm() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      scanId: string;
      lines: Array<{ productId: string; qty: number; unit: string }>;
    }) =>
      api.post(`/ocr/scan/${vars.scanId}/confirm`, { lines: vars.lines }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock', branchId] });
      qc.invalidateQueries({ queryKey: ['stock', 'movements', branchId] });
      toast.success('Fatura stoka işlendi');
    },
    onError: () => toast.error('Fatura onaylanamadı'),
  });
}

// ── Personnel hooks ───────────────────────────────────────────────────────────

function fetchBranchUsers(branchId: string): Promise<BranchUser[]> {
  return api.get<BranchUser[]>(`/users/branch/${branchId}`).then((r) => r.data);
}

export function useBranchUsers() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<BranchUser[]>({
    queryKey: ['users', branchId],
    queryFn: () => fetchBranchUsers(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });
}

// Manager mints a one-time registration code for their branch.
export function useGenerateRegistrationCode() {
  return useMutation({
    mutationFn: () =>
      api
        .post<{ token: string }>('/auth/register/generate-code')
        .then((r) => r.data),
  });
}

// Public — applicant completes registration with the code. Uses the shared
// `api` client (like /auth/login): no token is stored yet, so the request
// interceptor simply attaches no Authorization header.
export function useCompleteRegistration() {
  return useMutation({
    mutationFn: (vars: {
      token: string;
      name: string;
      email: string;
      password: string;
    }) =>
      api
        .post<{ id: string; email: string; name: string | null }>(
          '/auth/register/complete',
          vars,
        )
        .then((r) => r.data),
  });
}

export function useAssignRole() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: string; role: 'KASIYER' | 'DEPO' }) =>
      api.patch(`/auth/register/assign-role/${vars.userId}`, { role: vars.role }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', branchId] });
      toast.success('Rol güncellendi');
    },
    onError: () => toast.error('Rol güncellenemedi'),
  });
}

// ── Price update hooks ────────────────────────────────────────────────────────

function fetchPendingPriceUploads(branchId: string): Promise<PendingPriceUpload[]> {
  return api.get<PendingPriceUpload[]>(`/portal/uploads/${branchId}`).then((r) => r.data);
}

function fetchPriceChanges(branchId: string): Promise<PriceChange[]> {
  return api.get<PriceChange[]>(`/stock/price-changes/${branchId}`).then((r) => r.data);
}

export function usePendingPriceUploads() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<PendingPriceUpload[]>({
    queryKey: ['price-uploads', branchId],
    queryFn: () => fetchPendingPriceUploads(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });
}

export function useApprovePriceUpload() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uploadId: string) =>
      api.patch(`/portal/uploads/${uploadId}/approve`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-uploads', branchId] });
      toast.success('Fiyat güncellemesi onaylandı');
    },
    onError: () => toast.error('Fiyat güncellemesi onaylanamadı'),
  });
}

export function useRejectPriceUpload() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uploadId: string) =>
      api.patch(`/portal/uploads/${uploadId}/reject`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-uploads', branchId] });
      toast.success('Fiyat güncellemesi reddedildi');
    },
    onError: () => toast.error('Fiyat güncellemesi reddedilemedi'),
  });
}

export function usePriceUploadDetail(uploadId: string) {
  return useQuery<PriceUploadDetail>({
    queryKey: ['price-uploads', 'detail', uploadId],
    queryFn: () => api.get<PriceUploadDetail>(`/portal/uploads/detail/${uploadId}`).then((r) => r.data),
    enabled: !!uploadId,
  });
}

export function useUpdatePriceItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      uploadId: string;
      items: Array<{ productId: string; newPrice: number; discountPct?: number }>;
    }) =>
      api
        .patch(`/portal/uploads/${vars.uploadId}/items`, { items: vars.items })
        .then((r) => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['price-uploads', 'detail', vars.uploadId] });
      toast.success('Fiyat listesi kaydedildi');
    },
    onError: () => toast.error('Fiyat listesi kaydedilemedi'),
  });
}

export function usePriceChanges() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  return useQuery<PriceChange[]>({
    queryKey: ['price-changes', branchId],
    queryFn: () => fetchPriceChanges(branchId),
    staleTime: 1000 * 30,
    enabled: !!branchId,
  });
}

export function useUpdateOrder() {
  const { user } = useAuthStore();
  const branchId = user?.branchId ?? '';
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      orderId: string;
      data: { items: Array<{ productId: string; quantity: number }>; notes?: string };
    }) => api.patch(`/orders/${vars.orderId}`, vars.data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders', 'draft', branchId] });
      qc.invalidateQueries({ queryKey: ['orders', branchId] });
    },
    onError: () => toast.error('Sipariş güncellenemedi'),
  });
}
