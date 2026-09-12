/**
 * isletme-app/whatsapp-fiyat ekranını (Düzenle/İncele/Onayla/Reddet) GERÇEK
 * ürün+fiyat kalemleriyle manuel test edebilmek için, "Acme Corporation"
 * tenant'ının bir şubesine PENDING_REVIEW durumunda, dolu bir parsedItems ile
 * bir SupplierPortalUpload kaydı ekler.
 *
 * NEDEN GEREKTİ: portal.service.ts:uploadPdf, tedarikçi portalından PDF
 * yüklendiğinde parsedItems'ı HİÇ doldurmuyor (OCR ayrıştırma bu akışta
 * implemente edilmemiş — ocrStatus:'PENDING' hiçbir yerde işlenmiyor).
 * Gerçek/manuel testte kullanılan mevcut kayıtların (ör. "Mock Firma A.Ş.")
 * hepsi bu yüzden parsedItems:null ile oluşuyor ve "Düzenle" ekranı boş
 * görünüyor. Bu script, o eksik adımı manuel test için taklit eder.
 *
 * BU BİR SEED DEĞİL — idempotent DEĞİLDİR, her çalıştırmada YENİ bir kayıt
 * ekler (seed-sample-errors.ts ile aynı desen: bir kerelik manuel test
 * verisi, "zaten var mı" kontrolü yapılmaz).
 *
 * create-super-admin.ts / seed-sample-errors.ts ile aynı desen (dotenv, RLS
 * bypass için withTenantContext, doğrudan PrismaClient — NestJS DI yok).
 *
 * Kullanım: ts-node src/scripts/seed-sample-price-upload.ts
 *   (ya da: pnpm --filter api seed:sample-price-upload)
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // fallback, üzerine yazmaz

import { PrismaClient } from '@prisma/client';
import { withTenantContext } from '../common/utils/tenant-context';

const TARGET_COMPANY_NAME = 'Acme Corporation';
const TARGET_BRANCH_NAME = 'Istanbul HQ';
const TARGET_SUPPLIER_NAME = 'Güven Gıda A.Ş.';

// Gerçekten var olan ürünler tercih sırasıyla — isme göre aranır (id'ler
// ortamdan ortama değişebilir, bu yüzden sabit UUID kullanılmıyor). En az 3'ü
// bulunamazsa script hata ile durur.
const CANDIDATE_ITEMS: { productName: string; oldPrice: number; newPrice: number }[] = [
  { productName: 'Ayran 500ml', oldPrice: 12.0, newPrice: 13.5 },
  { productName: 'Coca-Cola 33cl', oldPrice: 15.0, newPrice: 16.75 },
  { productName: 'Su 50cl', oldPrice: 5.0, newPrice: 5.5 },
  { productName: 'E2E Meyve Suyu 1L', oldPrice: 22.0, newPrice: 24.9 },
];
const MIN_ITEMS_REQUIRED = 3;

async function main() {
  const prisma = new PrismaClient();

  try {
    const result = await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
      const tenant = await tx.tenant.findFirst({
        where: { companyName: TARGET_COMPANY_NAME, deletedAt: null },
        select: { id: true, companyName: true },
      });
      if (!tenant) return { error: `Tenant bulunamadı: "${TARGET_COMPANY_NAME}"` as const };

      // RLS: tenant bulunduktan sonra o tenant bağlamına geçip devam ediyoruz.
      return { tenant };
    });

    if ('error' in result) {
      console.error(`❌ ${result.error}`);
      process.exitCode = 1;
      return;
    }

    const tenantId = result.tenant.id;

    const created = await withTenantContext(prisma, { tenantId }, async (tx) => {
      const branch =
        (await tx.branch.findFirst({
          where: { tenantId, name: TARGET_BRANCH_NAME },
          select: { id: true, name: true },
        })) ??
        (await tx.branch.findFirst({
          where: { tenantId },
          select: { id: true, name: true },
          orderBy: { createdAt: 'asc' },
        }));
      if (!branch) throw new Error('Bu tenant için hiç şube bulunamadı.');

      const supplier =
        (await tx.supplier.findFirst({
          where: { tenantId, name: TARGET_SUPPLIER_NAME, deletedAt: null },
          select: { id: true, name: true, whatsappNumber: true },
        })) ??
        (await tx.supplier.findFirst({
          where: { tenantId, deletedAt: null },
          select: { id: true, name: true, whatsappNumber: true },
          orderBy: { createdAt: 'asc' },
        }));
      if (!supplier) throw new Error('Bu tenant için hiç tedarikçi bulunamadı.');

      const portal = await tx.branchSupplierPortal.findFirst({
        where: { tenantId, branchId: branch.id },
        select: { id: true },
      });

      const foundItems: {
        productId: string;
        productName: string;
        oldPrice: number;
        newPrice: number;
        discountPct: null;
        supplierPrice: number;
      }[] = [];
      for (const candidate of CANDIDATE_ITEMS) {
        const product = await tx.product.findFirst({
          where: { tenantId, name: candidate.productName, deletedAt: null },
          select: { id: true, name: true },
        });
        if (product) {
          foundItems.push({
            productId: product.id,
            productName: product.name,
            oldPrice: candidate.oldPrice,
            newPrice: candidate.newPrice,
            discountPct: null,
            // Oluşturma anında "Güncel Liste Fiyatı" = newPrice ile aynı —
            // bkz. portal.service.ts:ParsedItem yorumu (bir daha değişmez).
            supplierPrice: candidate.newPrice,
          });
        } else {
          console.log(`⚠️  Ürün bulunamadı, atlanıyor: "${candidate.productName}"`);
        }
      }
      if (foundItems.length < MIN_ITEMS_REQUIRED) {
        throw new Error(
          `Yalnızca ${foundItems.length} ürün bulundu (en az ${MIN_ITEMS_REQUIRED} gerekli). ` +
            'CANDIDATE_ITEMS listesini bu ortamdaki gerçek ürün adlarına göre güncelleyin.',
        );
      }

      const upload = await tx.supplierPortalUpload.create({
        data: {
          tenantId,
          branchId: branch.id,
          portalId: portal?.id ?? null,
          supplierId: supplier.id,
          uploaderPhone: supplier.whatsappNumber,
          otpVerifiedAt: new Date(),
          pdfUrl: `mock-s3/manual-test-${Date.now()}.pdf`,
          ocrExtractedFirm: supplier.name,
          ocrExtractedPhone: supplier.whatsappNumber,
          effectivePhone: supplier.whatsappNumber,
          ocrStatus: 'MOCK',
          uploadType: 'PRICE_UPDATE',
          status: 'PENDING_REVIEW',
          parsedItems: foundItems,
        },
      });

      return { branch, supplier, items: foundItems, upload };
    });

    console.log('✅ Manuel test kaydı oluşturuldu:\n');
    console.log(`   Upload ID:     ${created.upload.id}`);
    console.log(`   Tenant:        ${result.tenant.companyName}`);
    console.log(`   Şube:          ${created.branch.name}`);
    console.log(`   Tedarikçi:     ${created.supplier.name}`);
    console.log(`   Durum:         PENDING_REVIEW`);
    console.log(`   Ürün kalemi:   ${created.items.length}`);
    for (const item of created.items) {
      console.log(`     - ${item.productName}: ${item.oldPrice} ₺ → ${item.newPrice} ₺`);
    }
    console.log(
      '\nMobilde: isletme-app/whatsapp-fiyat ekranında bu tedarikçi adıyla ' +
        '("' + created.supplier.name + '") bekleyen kayıt olarak görünecek.',
    );
  } catch (err) {
    console.error('❌ Hata:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
