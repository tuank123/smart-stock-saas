---
name: bugs-fixed
description: Bugs found and fixed during E2E testing across S-1..S-10
metadata:
  type: project
---

**Bug 1 — transfers.service.ts receiveTransfer**  
`updateMany` for toBranch stock silently does nothing when no stock_level record exists for that product in that branch.  
Fixed: replaced `updateMany` with `upsert` using `@@unique([productId, branchId])`. Creates record with `minThreshold: 0` if missing.

**Bug 2 — ocr.service.ts fuzzyMatch token length**  
`tok.length > 2` excluded 2-char tokens like "su", preventing "Su 0.5L" from matching "Su 50cl".  
Fixed: changed to `tok.length > 1`.

**Bug 3 — E2E test: psql multi-statement returns SET prefix**  
When running `SET ...; SELECT id FROM ...` in a single psql `-t` call, output includes "SET" lines.  
Fixed: use separate psql calls for SET and SELECT, or use `tail -1 | xargs` to strip.

**Bug 4 — RLS blocks direct SQL DELETE in tests**  
Raw `DELETE FROM purchase_orders ...` fails silently when `app.tenant_id` not set.  
Fix: always prepend `SET app.is_super_admin = 'true'; SET app.tenant_id = '...';` in test SQL.

**Why:** All found during full E2E test passes.  
**How to apply:** Reference when writing new transfer or stock operations; prefer upsert over updateMany for cross-branch stock writes.
