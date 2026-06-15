---
name: technical-patterns
description: Core technical patterns used throughout StokPilot API
metadata:
  type: project
---

**RLS pattern (every DB operation):**
```typescript
return this.prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`SET app.tenant_id = '${user.tenantId}'`);
  await tx.$executeRawUnsafe(`SET app.is_super_admin = 'false'`);
  // queries here...
});
```

**Super-admin bypass (cross-tenant reads like scheduler):**
```typescript
await tx.$executeRawUnsafe(`SET app.is_super_admin = 'true'`);
```

**Fire-and-forget pattern (WhatsApp, Sync):**
```typescript
this.dispatchWhatsapp(order, tenantId).catch(err => this.logger.error(...));
```

**Prisma Decimal operations:** `.lte()`, `.times()`, `.minus()`, `.toNumber()`, `.negated()`, `new Prisma.Decimal(0)`

**Stock upsert for cross-branch writes:**
```typescript
await tx.stockLevel.upsert({
  where: { productId_branchId: { productId, branchId } },
  update: { quantity: { increment: qty }, version: { increment: 1 } },
  create: { tenantId, productId, branchId, quantity: qty, minThreshold: new Prisma.Decimal(0) },
});
```

**ScheduleModule:** `ScheduleModule.forRoot()` added once in `OrdersModule` and `SyncModule`. Nest deduplicates.

**ENV flags:** `WHATSAPP_ENABLED=false`, `OCR_ENABLED=false`, `SYNC_ENABLED=false` — all mock by default.

**Route versioning:** All routes need `/api/v1/` prefix. Login DTO requires `tenantId` field.

**DTO field names (frequently wrong in tests):**
- Branches: `name`, `slug` (required), `address`, `phone`
- Products: `name`, `sku`, `unit`, `categoryId` (no costPrice/salePrice)
- Suppliers: `name`, `contactName`, `whatsappNumber` (no productCategories)
- Stock initialize: `{ branchId, items: [{ productId, quantity }] }` (array format)
- Link supplier to branch: `{ isPrimary, notes }` (no phone)
- Staff register: `applicantName`, `applicantEmail`, `password`, `companyName` (exact DB value), `branchId`
- Company name in DB: `"Acme Corporation"` (not "Acme Corp")
