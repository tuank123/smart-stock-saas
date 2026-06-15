---
name: test-patterns
description: E2E test patterns, gotchas and helper patterns for StokPilot curl tests
metadata:
  type: project
---

**Auth token extraction:**
```bash
TOKEN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"...","password":"Test1234!","tenantId":"..."}' | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['accessToken'])")
```

**Capture HTTP code + body separately (avoid `head -n -1` on macOS):**
```bash
curl -s -o /tmp/out.json -w "%{http_code}" -X POST ... > /tmp/code.txt
CODE=$(cat /tmp/code.txt)
```

**JSON with newlines (messageBody etc.):** Always `curl -o /tmp/file.json` then `json.load(open('/tmp/file.json'))`.

**Direct DB queries (always set RLS first):**
```bash
PGPASSWORD=stok_password psql -h localhost -p 5432 -U stok_user stok_dev << 'EOF'
SET app.is_super_admin = 'true';
SET app.tenant_id = '290ec168-0ac0-4592-8d3f-163c70ad92cf';
SELECT ... FROM ...;
EOF
```

**UUID-only psql output (avoid SET prefix pollution):**
```bash
UUID=$(PGPASSWORD=stok_password psql -h localhost -p 5432 -U stok_user stok_dev -t -A -c \
  "SET app.is_super_admin = 'true'; SELECT id FROM table LIMIT 1;" 2>/dev/null | tail -1 | xargs)
```

**Delete DRAFT POs for clean automation test:**
```sql
SET app.is_super_admin = 'true';
SET app.tenant_id = '290ec168-...';
DELETE FROM purchase_order_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE branch_id='...' AND status='DRAFT');
DELETE FROM purchase_orders WHERE branch_id='...' AND status='DRAFT';
```

**Staff registration flow:**
1. POST /auth/register/request → `{ applicantName, applicantEmail, password, companyName: "Acme Corporation", branchId }`
2. GET /auth/register/pending/:branchId (MGR_TOKEN)
3. PATCH /auth/register/approve/:tokenId (MGR_TOKEN) → `{ token: "XXXXXXXX" }`
4. PATCH /auth/register/verify → `{ token }` (public)
5. Get userId from DB: `SELECT created_user_id FROM staff_registration_tokens WHERE token='...'`
6. PATCH /auth/register/assign-role/:userId (MGR_TOKEN, SUBE_MUDURU only) → `{ role: "KASIYER" }`

**assign-role:** Only SUBE_MUDURU can call it (not PATRON).
