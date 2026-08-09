# e2e Testleri

Bu klasördeki testler gerçek bir NestJS uygulaması ayağa kaldırır ve HTTP
üzerinden (supertest) çağırır. Mock yoktur: gerçek veritabanına, gerçek
guard'lara ve gerçek ValidationPipe'a karşı çalışırlar.

## Çalıştırma

```bash
pnpm --filter api test:e2e
```

`--runInBand` script'in içinde: testler aynı veritabanını paylaştığı için
paralel çalışmamalılar.

## CI

Her push (`main`) ve `main`'e açılan her PR'da testler GitHub Actions üzerinden
otomatik çalışır — bkz. [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml).
Pipeline postgres + redis servislerini ayağa kaldırır, şemayı ve RLS
politikalarını uygular, `api` ile `web` için tip kontrolü yapar, ardından bu
klasördeki e2e testleri koşar.

CI'da `.env.test` **yoktur** (git'e girmiyor); testin ihtiyaç duyduğu
değişkenler workflow'un `env:` bloğunda dummy değerlerle tanımlıdır. Buraya
yeni bir ortam değişkeni eklerseniz `ci.yml`'e de eklemeyi unutmayın, yoksa
lokalde geçen testler CI'da patlar.

## İlk kurulum (bir kez)

Testler **ayrı bir veritabanı** kullanır (`stok_test`). Geliştirme
veritabanınıza (`stok_dev`) asla dokunmazlar.

### 1. Test veritabanını oluşturun

```bash
createdb -U stok_user stok_test
```

`createdb` yoksa psql ile:

```bash
psql -U stok_user -d postgres -c "CREATE DATABASE stok_test;"
```

### 2. Şemayı uygulayın

```bash
cd packages/database
DATABASE_URL="postgresql://stok_user:stok_password@localhost:5432/stok_test" \
  npx prisma migrate deploy
```

> `migrate deploy` (dev değil) kullanın: mevcut migration'ları uygular, yeni
> migration üretmez.

RLS politikaları ayrı bir dosyada tutuluyor; test veritabanında da uygulayın:

```bash
psql -U stok_user -d stok_test -f packages/database/prisma/rls_setup.sql
```

### 3. `.env.test` dosyasını oluşturun

`apps/api/.env.test` **git'e girmez** (sır içerir). Yoksa testler açıklayıcı
bir hatayla durur. İçeriği için `.env.local`'i örnek alın; şu değerler farklı
olmalı:

| Anahtar | Değer |
|---|---|
| `NODE_ENV` | `test` |
| `DATABASE_URL` | `...localhost:5432/stok_test` (adı **test** içermeli) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | teste özel, dev'den farklı |
| `ENCRYPTION_KEY` | teste özel 64 karakterlik hex |
| `BCRYPT_ROUNDS` | `4` (testleri hızlandırır) |
| `ALLOWED_ORIGINS` | CORS testleri ilk girdiyi kullanır |

Seed gerekmez — testler ihtiyaç duyduğu hesabı `POST /tenants/signup` ile
kendisi oluşturur ve `afterAll`'da siler.

## Güvenlik freni

`test/load-env.ts`, veritabanı adında `test` geçmiyorsa testleri **başlatmadan**
durdurur. Testler veri sildiği için bu kasıtlı: yanlış yapılandırılmış bir
`.env.test` geliştirme verinizi silemez.

## Dosyalar

| Dosya | İşi |
|---|---|
| `load-env.ts` | Jest `setupFiles` — `.env.test`'i modüller yüklenmeden önce yükler, güvenlik frenini uygular |
| `setup.ts` | `createTestApp()` (main.ts bootstrap'ının aynısı) + temizlik yardımcıları |
| `auth.e2e-spec.ts` | login, şifre kuralı, şifre sıfırlama, e-posta doğrulama |
| `cors.e2e-spec.ts` | izinli/izinsiz origin, basit istek + preflight |

## Bilinen tuzaklar

**Throttle limitleri testleri kırabilir.** `/auth/forgot-password` rotasında
IP başına 3 istek / 15 dk sınırı var; `auth.e2e-spec.ts` şu an bu endpoint'e
**iki** istek atıyor. Yeni forgot-password testi eklerken limiti aşmayın,
yoksa 429 alırsınız. `/auth/login` sınırı 5/15dk, `/auth/resend-verification`
3/15dk. Throttler deposu bellekte olduğu için her `test:e2e` çalıştırması
sayaçları sıfırdan başlatır.

**Testler veritabanına yazar.** Her test kendi tenant'ını benzersiz vergi
numarasıyla oluşturur ve `afterAll`'da siler. Bir çalıştırma yarıda kesilirse
`E2E` ile başlayan vergi numaralı tenant'lar artakalabilir; temizlemek için:

```sql
DELETE FROM tenants WHERE tax_number LIKE 'E2E%';
```

**Kalıcı bağlantı/timer açan servisler `OnModuleDestroy` uygulamalı.** Yeni bir
servis Redis client (`createClient`) veya benzer bir kalıcı bağlantı/timer
açarsa, `OnModuleDestroy` uygulayıp bağlantıyı kapatmayı unutmayın — yoksa hem
testler asılı kalır hem production'da graceful shutdown sırasında bağlantı
sızıntısı olur. `auth.service.ts` ve `portal.service.ts`'te bu hatayı test
yazarken bulduk ve düzelttik.

Belirti: testlerin hepsi geçer ama süreç sonlanmaz ve Jest şunu basar:

```
Jest did not exit one second after the test run has completed.
```

`--detectOpenHandles` bu soketleri raporlamayabilir (bizim vakamızda
raporlamadı), o yüzden ona güvenmek yerine önce `createClient` / `setInterval`
çağrısı olup da `OnModuleDestroy` uygulamayan servisleri arayın:

```bash
grep -rn "createClient\|setInterval" --include="*.ts" src/
grep -rln "OnModuleDestroy" --include="*.ts" src/
```

Beklenen kapanış kalıbı:

```ts
async onModuleDestroy() {
  if (!this.redisClient) return;
  try { await this.redisClient.quit(); }
  catch { /* bağlantı zaten kopmuşsa kapanışı engellemesin */ }
  finally { this.redisClient = null; }
}
```
