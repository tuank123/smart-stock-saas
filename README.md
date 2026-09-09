# StokPilot API

Multi-tenant SaaS inventory management backend built with NestJS, Prisma, and PostgreSQL. Supports multiple companies (tenants), each with multiple branches, role-based access control, purchase order automation, supplier portal, real-time sync with ERP/POS systems, and scheduled reporting.

---

## Kurulum / Setup

### Gereksinimler / Prerequisites
- Node.js 20+
- pnpm 9+
- Docker & Docker Compose

### 1. Bağımlılıkları Yükle / Install dependencies

```bash
pnpm install
```

### 2. Ortam Değişkenlerini Ayarla / Configure environment

```bash
cp .env.example apps/api/.env.local
# apps/api/.env.local dosyasını düzenleyin
```

### 3. Veritabanını Başlat / Start database

```bash
docker-compose up -d
```

### 4. Migrasyon & Seed / Run migrations

```bash
# packages/database dizininde
pnpm db:migrate:dev
```

**Neden admin bağlantısı gerekiyor:** Yerel `stok_user` rolü artık kısıtlı —
CI'daki gibi CRUD (SELECT/INSERT/UPDATE/DELETE) hakları var ama
CREATE/ALTER/DROP TABLE YOK (bkz.
`packages/database/prisma/restrict_stok_user.sql`). Bu, RLS politikalarının
yerelde de gerçekten zorlanmasını sağlıyor — daha önce `stok_user` hem
superuser hem tablo sahibi olduğu için RLS sessizce bypass ediliyordu.

Bu yüzden `pnpm db:migrate:dev`/`db:migrate:deploy` artık düz `DATABASE_URL`
yerine `ADMIN_DATABASE_URL`'i (postgres rolü, `.env.example`'da placeholder
olarak var) kullanır — `packages/database/scripts/db-migrate.sh` bunu
otomatik yapar ve migration başarılı olur olmaz `stok_user`'a gereken
GRANT'ları (`prisma/grant_stok_user.sql`) da otomatik uygular. Elle bir şey
yapmanız gerekmez; `packages/database/.env.local` içinde `ADMIN_DATABASE_URL`
tanımlı olduğu sürece komut aynen eskisi gibi çalışır.

`ADMIN_DATABASE_URL` tanımlı değilse (ör. taze bir kurulum) komut açık bir
hatayla durur ve ne eklemeniz gerektiğini söyler.

---

## Çalıştırma / Running

```bash
# Geliştirme (hot-reload)
pnpm start:dev

# Üretim derlemesi
pnpm build --filter api
pnpm start:prod
```

API şu adreste çalışır: `http://localhost:3000/api/v1`

---

## Testler / Tests

```bash
# api e2e testleri (postgres + redis gerektirir)
pnpm --filter api test:e2e
```

İlk kurulum (test veritabanı, `.env.test`) için: [`apps/api/test/README.md`](apps/api/test/README.md)

**CI:** Her push (`main`) ve `main`'e açılan her PR'da testler GitHub Actions
üzerinden otomatik çalışır — bkz. [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
Pipeline tip kontrolünü (`api` + `web`) ve e2e testleri koşar.

---

## API Dökümantasyonu / API Documentation

Swagger UI (geliştirme modunda):

```
http://localhost:3000/api/docs
```

Bearer token ile kimlik doğrulama:
1. `POST /api/v1/auth/login` ile `accessToken` alın
2. Swagger UI'da **Authorize** butonuna tıklayın
3. Token'ı `Bearer <token>` formatında girin

---

## Sprint Özeti / Sprint Summary

| Sprint | Konu | Endpoint Sayısı |
|--------|------|----------------|
| S-1 | Monorepo, NestJS, JWT auth, Prisma, Docker | Auth (login/refresh/logout) |
| S-2 | TenantGuard, RolesGuard, RLS policies, staff_registration_tokens | — |
| S-3 | Şube & entegrasyon yönetimi | `/branches`, `/integrations/adapters` |
| S-4 | Ürün kataloğu & kategoriler | `/products`, `/categories` |
| S-5 | Stok seviyeleri | `/stock` |
| S-6 | Tedarikçi yönetimi | `/suppliers` |
| S-7 | Satın alma siparişleri & WhatsApp | `/orders` |
| S-8 | Stok transferleri | `/transfers` |
| S-9 | Sync queue (ERP/POS entegrasyonu) | `/sync` |
| S-10 | OCR fatura tarama | `/ocr` |
| S-11 | Tedarikçi portalı (OTP, PDF yükleme) | `/portal` |
| S-12 | Raporlama (günlük/aylık, anomali tespiti) | `/reports` |
| S-13 | Web istasyon endpoint'leri (KASIYER/DEPO) | `/stock/query`, `/stock/movements`, `/sync/status/station`, `/orders/station`, `/orders/:id/receive` |
| S-14 | Beta hazırlığı (Swagger, rate limiting, helmet, CORS) | — |

---

## Modüller / Modules

```
apps/api/src/modules/
├── auth/              # JWT login, refresh, logout
├── staff-registration/ # Personel kayıt akışı
├── users/             # Kullanıcı profili
├── tenants/           # Tenant (şirket) yönetimi
├── branches/          # Şube & ERP/POS entegrasyon
├── products/          # Ürün kataloğu
├── stock/             # Stok seviyeleri, hareketler
├── suppliers/         # Tedarikçi yönetimi
├── orders/            # Satın alma siparişleri
├── transfers/         # Şubeler arası transfer
├── whatsapp/          # WhatsApp mesaj gönderimi
├── ocr/               # Fatura OCR tarama
├── sync/              # ERP/POS sync kuyruğu
├── portal/            # Tedarikçi self-servis portalı
└── reports/           # Günlük/aylık raporlar, anomali tespiti
```

---

## Roller / Roles

| Rol | Açıklama |
|-----|----------|
| `PATRON` | Tüm şubelere erişim, raporlama |
| `SUBE_MUDURU` | Şube yöneticisi, sipariş onayı |
| `KASIYER` | Stok sorgulama, OCR tarama |
| `DEPO` | Mal kabul, stok hareketleri |

---

## Güvenlik / Security

- **JWT Bearer** kimlik doğrulama (15 dk access + 7 gün refresh cookie)
- **Row-Level Security (RLS)** — PostgreSQL'de tenant izolasyonu
- **Rate Limiting**: 100 istek/dk (genel), 5 istek/15dk (login), 3 istek/5dk (OTP)
- **Helmet** güvenlik header'ları
- **CORS** kısıtlaması

---

## Test / Testing

```bash
# E2E testleri (API ayakta olmalı)
# T-1..T-72 manuel curl testleri — her sprint için test senaryoları mevcuttur

# TypeScript derleme kontrolü
pnpm build --filter api
```

---

## Ortam Değişkenleri / Environment Variables

Tüm değişkenler için `.env.example` dosyasına bakın.

| Değişken | Açıklama | Varsayılan |
|----------|----------|-----------|
| `DATABASE_URL` | PostgreSQL bağlantı URL'i (kısıtlı `stok_user`, uygulama bunu kullanır) | — |
| `ADMIN_DATABASE_URL` | Şema migration'ları için admin bağlantısı (`postgres` rolü) — bkz. "Migrasyon" bölümü | — |
| `REDIS_URL` | Redis bağlantı URL'i | `redis://localhost:6379` |
| `JWT_SECRET` | Access token imzalama sırrı | — |
| `JWT_REFRESH_SECRET` | Refresh token imzalama sırrı | — |
| `WHATSAPP_ENABLED` | WhatsApp entegrasyonu aktif mi | `false` |
| `OCR_ENABLED` | OCR entegrasyonu aktif mi | `false` |
| `SYNC_ENABLED` | ERP/POS sync aktif mi | `false` |
| `OTP_ENABLED` | SMS OTP aktif mi (`false` → her zaman 123456) | `false` |
| `S3_ENABLED` | S3 dosya yükleme aktif mi | `false` |
| `PORTAL_JWT_SECRET` | Tedarikçi portal session token sırrı | — |
