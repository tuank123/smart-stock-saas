#!/usr/bin/env bash
# Yerel şema migration'ı — ADMIN_DATABASE_URL (postgres rolü) ile çalışır,
# başarılı olursa otomatik olarak grant_stok_user.sql'i uygular.
#
# NEDEN: yerel stok_user artık kısıtlı bir rol (bkz.
# prisma/restrict_stok_user.sql) — CRUD dışında CREATE/ALTER/DROP TABLE
# yapamaz. Şema migration'ları artık admin (postgres) bağlantısı gerektiriyor
# — tıpkı CI'daki ADMIN_DATABASE_URL/DATABASE_URL ayrımı gibi (bkz.
# .github/workflows/ci.yml). Bu script o ayrımı tek komuta gizler ve
# migration sonrası GRANT adımını unutmayı imkânsız kılar.
#
# Kullanım (doğrudan çağrılmaz — package.json script'leri üzerinden):
#   pnpm db:migrate:dev [-- --name migration_adi]
#   pnpm db:migrate:deploy
set -euo pipefail

MODE="${1:?Kullanım: db-migrate.sh <dev|deploy> [prisma argümanları...]}"
shift

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(dirname "$SCRIPT_DIR")"

# .env.local'i mevcut ortama yükle (varsa) — zaten dışarıdan export edilmiş
# bir ADMIN_DATABASE_URL varsa (ör. CI) bu satır onu ezer; yerel kullanım
# için sorun değil, CI zaten bu script'i değil kendi adımlarını kullanıyor.
if [ -f "$DB_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$DB_DIR/.env.local"
  set +a
fi

if [ -z "${ADMIN_DATABASE_URL:-}" ]; then
  echo "❌ ADMIN_DATABASE_URL tanımlı değil (packages/database/.env.local içine ekleyin)." >&2
  echo "   Örnek: ADMIN_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/stok_dev" >&2
  exit 1
fi

echo "▶ prisma migrate $MODE (admin bağlantısıyla)..."
(cd "$DB_DIR" && DATABASE_URL="$ADMIN_DATABASE_URL" npx prisma migrate "$MODE" "$@")

echo "▶ stok_user için GRANT uygulanıyor (grant_stok_user.sql)..."
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DB_DIR/prisma/grant_stok_user.sql"

echo "✅ Migration ($MODE) + GRANT tamamlandı — stok_user yeni tabloları/sekansları görebilir."
