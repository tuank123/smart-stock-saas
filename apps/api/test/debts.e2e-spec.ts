/**
 * Alacak Verecek (borç takip) akışı — nakit borç ödemesi, ürün borcu teslim
 * alma ve hatırlatma mantığının uçtan uca doğrulaması.
 *
 * Bu akış yalnızca tek şubeli (STARTER planlı) PATRON için açık
 * (debts.service.ts → assertAllowed), bu yüzden signupAndGetContext()'in
 * varsayılan 'TEK_SUBE' businessType'ı kasıtlı olarak değiştirilmiyor.
 *
 * Debt/Product/Category/Supplier tabloları RLS'siz olduğu için doğrudan
 * Prisma ile kurulan sabit veriler (kategori) güvenle oluşturulabiliyor —
 * bkz. test/setup.ts createCategory yorumu.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  cleanupTenants,
  createCategory,
  signupAndGetContext,
  uniqueSuffix,
  type SignedUpContext,
} from './setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { withTenantContext } from '../src/common/utils/tenant-context';

describe('Debts / Alacak Verecek (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ctx: SignedUpContext;
  let authHeader: string;
  let supplierId: string;
  let productId: string;

  const createdTaxNumbers: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    ctx = await signupAndGetContext(app);
    authHeader = `Bearer ${ctx.accessToken}`;
    createdTaxNumbers.push(ctx.payload.taxNumber);

    const supplierRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', authHeader)
      .send({ name: `E2E Tedarikçi ${uniqueSuffix()}`, whatsappNumber: '+905551234567' })
      .expect(201);
    supplierId = supplierRes.body.id;

    const category = await createCategory(prisma, ctx.tenantId, 'E2E Borç Kategorisi');

    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authHeader)
      .send({
        sku: `E2E-DEBT-${uniqueSuffix()}`,
        name: 'E2E Borç Ürünü',
        unit: 'adet',
        categoryId: category.id,
      })
      .expect(201);
    productId = productRes.body.id;
  });

  afterAll(async () => {
    await cleanupTenants(prisma, createdTaxNumbers);
    await app.close();
  });

  // ── (a) Nakit borç oluşturma ─────────────────────────────────────────────

  let cashDebtId: string;

  it('POST /debts/:branchId — CASH/PAYABLE borç 201 döner, remainingAmount amount\'a eşittir', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/debts/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .send({
        supplierId,
        direction: 'PAYABLE',
        debtType: 'CASH',
        amount: 1000,
      })
      .expect(201);

    cashDebtId = res.body.id;
    expect(res.body.debtType).toBe('CASH');
    expect(res.body.direction).toBe('PAYABLE');
    expect(res.body.status).toBe('OPEN');
    expect(Number(res.body.amount)).toBe(1000);
    expect(Number(res.body.remainingAmount)).toBe(1000);
  });

  // Ciro primi / firma geri ödemesi manuel giriş ekranından KALDIRILDI —
  // yalnızca OCR fatura onayı akışında (ocr.service.ts confirmScan,
  // ocr.e2e-spec.ts) yaşamaya devam ediyor. CreateDebtDto/createDebt artık
  // bu alanları kabul etmiyor (ValidationPipe forbidNonWhitelisted:true —
  // gönderilirse 400 döner), bu yüzden bu akışa özgü eski testler kaldırıldı.

  // recordCashPayment (PATCH /debts/:id/cash-payment) TAMAMEN KALDIRILDI —
  // tedarikçi bakiyesi artık SupplierLedgerEntry ile takip ediliyor (bkz.
  // aşağıdaki "(b-bis) Tedarikçi bakiyesi/ledger" bölümü). Eski "kısmi
  // ödeme"/"tam ödeme → PAID" testleri bu yüzden kaldırıldı — o davranış
  // (Debt.remainingAmount/status güncellemesi) artık hiç var olmuyor; Debt
  // satırları donmuş tarihi kayıtlar, bakiye hesaplaması ledger'da.

  // ── (b-bis) Tedarikçi bakiyesi/ledger ────────────────────────────────────

  let ledgerSupplierId: string;

  it('POST /debts/:branchId — PAYABLE/CASH borç oluşunca tedarikçi bakiyesine INVOICE hareketi eklenir', async () => {
    const supplierRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', authHeader)
      .send({ name: `E2E Ledger Tedarikçi ${uniqueSuffix()}`, whatsappNumber: '+905551112233' })
      .expect(201);
    ledgerSupplierId = supplierRes.body.id;

    const debtRes = await request(app.getHttpServer())
      .post(`/api/v1/debts/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .send({ supplierId: ledgerSupplierId, direction: 'PAYABLE', debtType: 'CASH', amount: 1000 })
      .expect(201);

    const ledgerRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}/suppliers/${ledgerSupplierId}/ledger`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(Number(ledgerRes.body.balance)).toBe(1000);
    const entry = ledgerRes.body.recentEntries.find(
      (e: { sourceDebtId: string | null }) => e.sourceDebtId === debtRes.body.id,
    );
    expect(entry).toBeDefined();
    expect(entry.type).toBe('INVOICE');
    expect(Number(entry.amount)).toBe(1000);
  });

  it('POST /debts/:branchId — RECEIVABLE/CASH borç oluşunca tedarikçi bakiyesine HİÇBİR hareket eklenmez', async () => {
    const supplierRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', authHeader)
      .send({ name: `E2E Ledger Receivable Tedarikçi ${uniqueSuffix()}`, whatsappNumber: '+905551112244' })
      .expect(201);
    const receivableSupplierId = supplierRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/debts/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .send({ supplierId: receivableSupplierId, direction: 'RECEIVABLE', debtType: 'CASH', amount: 300 })
      .expect(201);

    const ledgerRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}/suppliers/${receivableSupplierId}/ledger`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(Number(ledgerRes.body.balance)).toBe(0);
    expect(ledgerRes.body.recentEntries).toHaveLength(0);
  });

  it('POST .../ledger — PAYMENT bakiyeyi düşürür, GET .../ledger balance/recentEntries doğru yansıtır', async () => {
    const payRes = await request(app.getHttpServer())
      .post(`/api/v1/debts/${ctx.branchId}/suppliers/${ledgerSupplierId}/ledger`)
      .set('Authorization', authHeader)
      .send({ type: 'PAYMENT', amount: 400 })
      .expect(201);
    expect(payRes.body.type).toBe('PAYMENT');
    expect(Number(payRes.body.amount)).toBe(400);

    const ledgerRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}/suppliers/${ledgerSupplierId}/ledger`)
      .set('Authorization', authHeader)
      .expect(200);

    // Önceki testten INVOICE 1000 vardı → 1000 - 400 = 600.
    expect(Number(ledgerRes.body.balance)).toBe(600);
    expect(
      ledgerRes.body.recentEntries.some((e: { type: string }) => e.type === 'PAYMENT'),
    ).toBe(true);
  });

  it('POST .../ledger — CIRO_PRIMI/FIRMA_GERI_ODEMESI bakiyeyi düşürür ve recentRebates\'te görünür, IADE_FATURASI recentReturns\'te görünür', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/debts/${ctx.branchId}/suppliers/${ledgerSupplierId}/ledger`)
      .set('Authorization', authHeader)
      .send({ type: 'CIRO_PRIMI', amount: 100 })
      .expect(201);

    const ledgerRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}/suppliers/${ledgerSupplierId}/ledger`)
      .set('Authorization', authHeader)
      .expect(200);

    // 600 (önceki testten) - 100 = 500.
    expect(Number(ledgerRes.body.balance)).toBe(500);
    expect(ledgerRes.body.recentRebates).toHaveLength(1);
    expect(ledgerRes.body.recentRebates[0].type).toBe('CIRO_PRIMI');
    expect(Number(ledgerRes.body.recentRebates[0].amount)).toBe(100);
    // IADE_FATURASI türünde hiçbir kayıt yok — recentReturns boş kalmalı.
    expect(ledgerRes.body.recentReturns).toHaveLength(0);
  });

  it('POST .../ledger — bakiye negatife düşebilir (hata değil, izin verilen senaryo)', async () => {
    const supplierRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', authHeader)
      .send({ name: `E2E Ledger Negatif Tedarikçi ${uniqueSuffix()}`, whatsappNumber: '+905551112255' })
      .expect(201);
    const negSupplierId = supplierRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/debts/${ctx.branchId}/suppliers/${negSupplierId}/ledger`)
      .set('Authorization', authHeader)
      .send({ type: 'PAYMENT', amount: 250 })
      .expect(201);

    const ledgerRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}/suppliers/${negSupplierId}/ledger`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(Number(ledgerRes.body.balance)).toBe(-250);
  });

  it('POST .../ledger — amount <= 0 gönderilirse 400 döner', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/debts/${ctx.branchId}/suppliers/${ledgerSupplierId}/ledger`)
      .set('Authorization', authHeader)
      .send({ type: 'PAYMENT', amount: 0 })
      .expect(400);
  });

  it('GET .../ledger — monthlyBreakdown son 4 takvim ayını, bu ayın INVOICE toplamını doğru yansıtır', async () => {
    const ledgerRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}/suppliers/${ledgerSupplierId}/ledger`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(ledgerRes.body.monthlyBreakdown).toHaveLength(4);
    const now = new Date();
    const currentMonthEntry = ledgerRes.body.monthlyBreakdown[3];
    expect(currentMonthEntry.year).toBe(now.getUTCFullYear());
    expect(currentMonthEntry.month).toBe(now.getUTCMonth() + 1);
    // Bu ay içinde oluşturulan: 1000 INVOICE, 400 PAYMENT, 100 CIRO_PRIMI.
    expect(currentMonthEntry.invoiceTotal).toBe(1000);
    expect(currentMonthEntry.paymentTotal).toBe(400);
    expect(currentMonthEntry.rebateTotal).toBe(100);
    expect(currentMonthEntry.returnTotal).toBe(0);
  });

  it('GET /debts/:branchId/suppliers/ledger-balances — birden çok tedarikçi için toplu bakiyeler, tek tek GET .../ledger ile eşleşir', async () => {
    // ledgerSupplierId (yukarıdaki testlerden): INVOICE 1000, PAYMENT 400,
    // CIRO_PRIMI 100 → bakiye 500.
    const supplierRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', authHeader)
      .send({ name: `E2E Toplu Bakiye Tedarikçi ${uniqueSuffix()}`, whatsappNumber: '+905551112266' })
      .expect(201);
    const bulkSupplierId = supplierRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/debts/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .send({ supplierId: bulkSupplierId, direction: 'PAYABLE', debtType: 'CASH', amount: 2000 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/debts/${ctx.branchId}/suppliers/${bulkSupplierId}/ledger`)
      .set('Authorization', authHeader)
      .send({ type: 'PAYMENT', amount: 300 })
      .expect(201);

    const balancesRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}/suppliers/ledger-balances`)
      .set('Authorization', authHeader)
      .expect(200);

    const balanceByLedgerSupplier = balancesRes.body.find(
      (b: { supplierId: string }) => b.supplierId === ledgerSupplierId,
    );
    const balanceByBulkSupplier = balancesRes.body.find(
      (b: { supplierId: string }) => b.supplierId === bulkSupplierId,
    );
    expect(balanceByLedgerSupplier).toBeDefined();
    expect(balanceByBulkSupplier).toBeDefined();
    expect(Number(balanceByLedgerSupplier.balance)).toBe(500);
    expect(Number(balanceByBulkSupplier.balance)).toBe(1700);

    // Tek tek GET .../ledger ile birebir eşleşmeli.
    const individualLedgerRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}/suppliers/${ledgerSupplierId}/ledger`)
      .set('Authorization', authHeader)
      .expect(200);
    const individualBulkRes = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}/suppliers/${bulkSupplierId}/ledger`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(Number(balanceByLedgerSupplier.balance)).toBe(Number(individualLedgerRes.body.balance));
    expect(Number(balanceByBulkSupplier.balance)).toBe(Number(individualBulkRes.body.balance));

    // Hiç SupplierLedgerEntry'si olmayan bir tedarikçi listede yer almamalı.
    const noEntrySupplierRes = await request(app.getHttpServer())
      .post('/api/v1/suppliers')
      .set('Authorization', authHeader)
      .send({ name: `E2E Hareketsiz Tedarikçi ${uniqueSuffix()}`, whatsappNumber: '+905551112277' })
      .expect(201);
    const noEntrySupplierId = noEntrySupplierRes.body.id;
    const balancesRes2 = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}/suppliers/ledger-balances`)
      .set('Authorization', authHeader)
      .expect(200);
    expect(
      balancesRes2.body.some((b: { supplierId: string }) => b.supplierId === noEntrySupplierId),
    ).toBe(false);
  });

  // ── (d) Ürün borcu oluşturma ─────────────────────────────────────────────

  let productDebtId: string;

  it('POST /debts/:branchId — PRODUCT tipi borç 201 döner', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/debts/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .send({
        supplierId,
        direction: 'PAYABLE',
        debtType: 'PRODUCT',
        productLines: [{ productId, quantity: 10 }],
      })
      .expect(201);

    productDebtId = res.body.id;
    expect(res.body.debtType).toBe('PRODUCT');
    expect(res.body.status).toBe('OPEN');
    expect(res.body.productLines).toHaveLength(1);
    expect(res.body.productLines[0].productId).toBe(productId);
    expect(res.body.productLines[0].quantity).toBe(10);
    expect(res.body.productLines[0].receivedQuantity).toBe(0);
  });

  // ── (e) Kısmi teslim alma ─────────────────────────────────────────────────

  it('PATCH /debts/:id/product-receipt — kısmi teslimde receivedQuantity doğru artar', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/debts/${productDebtId}/product-receipt`)
      .set('Authorization', authHeader)
      .send({ lines: [{ productId, receivedQuantity: 4 }] })
      .expect(200);

    expect(res.body.productLines[0].receivedQuantity).toBe(4);
    expect(res.body.productLines[0].quantity).toBe(10);
    // 4/10 teslim alındı, borç henüz kapanmadı.
    expect(res.body.status).toBe('OPEN');
  });

  // ── (f) Hatırlatmalar ──────────────────────────────────────────────────────

  it('GET /debts/:branchId/reminders — yeni şube için ziyaret hatırlatması ve açık RECEIVABLE borç gösterir', async () => {
    // showVisitReminder, branch hiç görüntülenmediği (debtsLastViewedAt=null)
    // için zaten true olacak; receivableReminders'ı test etmek için açık bir
    // RECEIVABLE borç oluşturuyoruz (yukarıdaki (a)-(e) hepsi PAYABLE'dı).
    const receivable = await request(app.getHttpServer())
      .post(`/api/v1/debts/${ctx.branchId}`)
      .set('Authorization', authHeader)
      .send({
        supplierId,
        direction: 'RECEIVABLE',
        debtType: 'CASH',
        amount: 200,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/debts/${ctx.branchId}/reminders`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(res.body.showVisitReminder).toBe(true);
    expect(Array.isArray(res.body.receivableReminders)).toBe(true);

    const match = res.body.receivableReminders.find(
      (r: { debtId: string }) => r.debtId === receivable.body.id,
    );
    expect(match).toBeDefined();
    expect(Number(match.amount)).toBe(200);
    expect(match.supplierName).toBe(receivable.body.supplier.name);

    // PAYABLE olan (a) borcu receivableReminders'da GÖRÜNMEMELİ.
    const payableLeak = res.body.receivableReminders.find(
      (r: { debtId: string }) => r.debtId === cashDebtId,
    );
    expect(payableLeak).toBeUndefined();
  });

  // ── (g) Tenant izolasyonu — assertTenantOwnership regresyonu ────────────
  //
  // debts.service.ts'de daha önce (bu düzeltmeden önce) tx.debt.findFirst/
  // tx.branch.findFirst çağrılarının HİÇBİRİNDE tenantId kontrolü yoktu —
  // ne where'de, ne post-fetch, ne de RLS (debts/branch-lookup-burada RLS'siz
  // bağlamda). Bu blok, ctx1'in başka bir tenant'ın (ctx2) borcuna/şubesine
  // erişim denemesinin artık 404 döndüğünü VE gerçekte HİÇBİR mutasyon
  // gerçekleşmediğini (DB'den doğrudan okuyarak) kanıtlıyor.
  describe('Tenant izolasyonu (cross-tenant erişim reddi)', () => {
    let ctx2: SignedUpContext;
    let authHeader2: string;
    let foreignCashDebtId: string;
    let foreignProductDebtId: string;
    let foreignProductId: string;
    let supplier2Id: string;

    beforeAll(async () => {
      ctx2 = await signupAndGetContext(app);
      authHeader2 = `Bearer ${ctx2.accessToken}`;
      createdTaxNumbers.push(ctx2.payload.taxNumber);

      const supplier2Res = await request(app.getHttpServer())
        .post('/api/v1/suppliers')
        .set('Authorization', authHeader2)
        .send({ name: `E2E Tenant2 Tedarikçi ${uniqueSuffix()}`, whatsappNumber: '+905559998877' })
        .expect(201);
      supplier2Id = supplier2Res.body.id;

      const category2 = await createCategory(prisma, ctx2.tenantId, 'E2E Tenant2 Borç Kategorisi');
      const product2Res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', authHeader2)
        .send({
          sku: `E2E-DEBT2-${uniqueSuffix()}`,
          name: 'E2E Tenant2 Borç Ürünü',
          unit: 'adet',
          categoryId: category2.id,
        })
        .expect(201);
      foreignProductId = product2Res.body.id;

      const cashDebt2Res = await request(app.getHttpServer())
        .post(`/api/v1/debts/${ctx2.branchId}`)
        .set('Authorization', authHeader2)
        .send({ supplierId: supplier2Id, direction: 'PAYABLE', debtType: 'CASH', amount: 500 })
        .expect(201);
      foreignCashDebtId = cashDebt2Res.body.id;

      const productDebt2Res = await request(app.getHttpServer())
        .post(`/api/v1/debts/${ctx2.branchId}`)
        .set('Authorization', authHeader2)
        .send({
          supplierId: supplier2Id,
          direction: 'PAYABLE',
          debtType: 'PRODUCT',
          productLines: [{ productId: foreignProductId, quantity: 10 }],
        })
        .expect(201);
      foreignProductDebtId = productDebt2Res.body.id;
    });

    async function readDebtGlobal(debtId: string) {
      return withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
        return tx.debt.findUnique({ where: { id: debtId } });
      });
    }

    async function readBranchGlobal(branchId: string) {
      return withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
        return tx.branch.findUnique({ where: { id: branchId } });
      });
    }

    it('PATCH /debts/:id — başka tenant\'ın borcunu güncelleme denemesi 404 döner, notes DEĞİŞMEZ', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/debts/${foreignCashDebtId}`)
        .set('Authorization', authHeader)
        .send({ notes: 'Ele geçirme denemesi' })
        .expect(404);

      const debt = await readDebtGlobal(foreignCashDebtId);
      expect(debt?.notes).not.toBe('Ele geçirme denemesi');
    });

    it('GET .../suppliers/:supplierId/ledger — başka tenant\'ın tedarikçisi için 404 döner', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/debts/${ctx.branchId}/suppliers/${supplier2Id}/ledger`)
        .set('Authorization', authHeader)
        .expect(404);
    });

    it('POST .../suppliers/:supplierId/ledger — başka tenant\'ın tedarikçisine hareket eklenemez (404), HİÇBİR SupplierLedgerEntry OLUŞMAZ', async () => {
      const before = await prisma.supplierLedgerEntry.count({ where: { supplierId: supplier2Id } });

      await request(app.getHttpServer())
        .post(`/api/v1/debts/${ctx.branchId}/suppliers/${supplier2Id}/ledger`)
        .set('Authorization', authHeader)
        .send({ type: 'PAYMENT', amount: 100 })
        .expect(404);

      const after = await prisma.supplierLedgerEntry.count({ where: { supplierId: supplier2Id } });
      expect(after).toBe(before);
    });

    it('PATCH /debts/:id/product-receipt — başka tenant\'ın ürün borcuna teslimat kaydetme denemesi 404 döner, receivedQuantity DEĞİŞMEZ', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/debts/${foreignProductDebtId}/product-receipt`)
        .set('Authorization', authHeader)
        .send({ lines: [{ productId: foreignProductId, receivedQuantity: 5 }] })
        .expect(404);

      const debt = await readDebtGlobal(foreignProductDebtId);
      const lines = debt?.productLines as unknown as { productId: string; receivedQuantity: number }[];
      const line = lines.find((l) => l.productId === foreignProductId);
      expect(line?.receivedQuantity).toBe(0);
    });

    it('PATCH /debts/:branchId/mark-viewed — başka tenant\'ın şubesini görüntülendi işaretleme denemesi 404 döner, debtsLastViewedAt DEĞİŞMEZ', async () => {
      const before = await readBranchGlobal(ctx2.branchId);
      expect(before?.debtsLastViewedAt).toBeNull();

      await request(app.getHttpServer())
        .patch(`/api/v1/debts/${ctx2.branchId}/mark-viewed`)
        .set('Authorization', authHeader)
        .expect(404);

      const after = await readBranchGlobal(ctx2.branchId);
      expect(after?.debtsLastViewedAt).toBeNull();
    });

    it('PATCH /debts/:id — gerçekten var olmayan bir ID ile de 404 döner (yanlış ID ile "başka tenant" ayrımı korunuyor)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/debts/99999999-9999-4999-8999-999999999999')
        .set('Authorization', authHeader)
        .send({ notes: 'yok' })
        .expect(404);
    });
  });
});
