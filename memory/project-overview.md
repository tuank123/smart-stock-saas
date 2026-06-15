---
name: project-overview
description: StokPilot SaaS project status — completed sprints, key constants, user accounts
metadata:
  type: project
---

Multi-tenant SaaS inventory management — NestJS monorepo at `/Users/tuankucuk/Desktop/stok-saas`.

**Completed sprints:** S-1 (auth/JWT) → S-10 (sync worker). All 38 S-1..S-9 E2E tests pass. S-10: 10/10.

**API base:** `http://localhost:3000/api/v1` (versioned routes)  
**Login DTO:** `{ email, password, tenantId }` → response `{ data: { accessToken, user } }`

**Known DB IDs (Acme Corp):**
- TID: `290ec168-0ac0-4592-8d3f-163c70ad92cf`
- BRANCH1 (Istanbul HQ): `e2f1b2a5-54d5-45f4-a758-08ea658399ea`
- BRANCH2 (Ankara): `22840b31-a87d-4e82-aea0-3ef805870767`
- COLA_ID (Coca-Cola 33cl): `f712171d-e1ad-4d00-bb5b-edaff8e1ed58`
- CAT_ICECEK: `11619b78-b901-420d-92bc-e6d8e5f1127f`
- Primary supplier: `7ad1fce4-ce30-4131-9480-2a40ed4c5a40` (Güven Gıda A.Ş.)
- Beta Corp TID: `d5782c34-5fe7-4010-847f-193ce0e80b39`

**Test users (all password: Test1234!):**
- admin@acme.com → PATRON
- manager@acme.com → SUBE_MUDURU (branchId=BRANCH1)
- calisan@test.com → KASIYER
- rolsuz@test.com → null role
- depo_test@test.com → DEPO
- beta@test.com → PATRON (Beta Corp)

**Why:** Building incrementally sprint by sprint. Each sprint adds a feature module and E2E tests.
**How to apply:** Always include `tenantId` in login. Use `data.accessToken` from response.
