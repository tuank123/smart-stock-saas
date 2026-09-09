-- Yerel geliştirme rolünü CI'daki kısıtlı `stok_user` ile birebir aynı hale
-- getirir (bkz. .github/workflows/ci.yml, "Yetkisiz stok_user rolünü
-- oluştur" adımı). Amaç: yerelde de RLS gerçekten ZORLANSIN — stok_user
-- superuser/tablo sahibi olduğu sürece RLS politikaları sessizce bypass
-- edilir (PostgreSQL kuralı: sahip ve superuser'lar RLS'e tabi değildir).
--
-- ÇALIŞTIRMA:
--   Docker Compose (docker-compose.yml) bu dosyayı postgres servisinin
--   /docker-entrypoint-initdb.d/ dizinine bağlıyor — TAMAMEN YENİ bir
--   `docker-compose up` (boş volume) bunu OTOMATİK, ilk açılışta, bootstrap
--   superuser'ı (POSTGRES_USER=stok_user) olarak çalıştırır. Bu, o anda
--   henüz superuser olan stok_user'ın KENDİSİNİ kısıtlaması demektir —
--   script bilerek bu sırayla yazıldı (önce yeni sahip rol + REASSIGN,
--   EN SON stok_user'ın kendi yetkilerini düşürme).
--
--   Postgres init script'leri YALNIZCA boş bir data dizininde, İLK açılışta
--   çalışır — halihazırda verisi olan (postgres_data adlı) mevcut bir
--   volume'a otomatik uygulanmaz. Böyle bir ortamda (ör. bu depoyu daha önce
--   kurmuş bir geliştirici) bu dosyayı ELLE, HER veritabanına karşı ayrı
--   ayrı çalıştırın. stok_user rolü CLUSTER GENELİNDEDİR (veritabanına özel
--   değil) — İLK çalıştırmadan sonra stok_user zaten superuser'lığını
--   kaybeder, bu yüzden İKİNCİ (ve sonraki) veritabanları için artık
--   stok_user DEĞİL, yeni oluşan `postgres` rolüyle bağlanılmalı (ampirik
--   olarak doğrulandı — stok_user ile denenirse "must be member of role
--   postgres" hatası alınır):
--     PGPASSWORD=stok_password psql -h localhost -p 5432 -U stok_user -d stok_dev  -v ON_ERROR_STOP=1 -f packages/database/prisma/restrict_stok_user.sql
--     PGPASSWORD=postgres      psql -h localhost -p 5432 -U postgres   -d stok_test -v ON_ERROR_STOP=1 -f packages/database/prisma/restrict_stok_user.sql
--   (stok_test yoksa önce `createdb -U stok_user stok_test` ile oluşturun —
--   yalnızca stok_dev'e karşı ilk çalıştırmadan ÖNCE yapın, sonrasında
--   stok_user'ın CREATEDB hakkı kalmaz.)
--
-- ÖNEMLİ SONUÇ — şema migration'ları artık stok_user ile ÇALIŞMAZ:
--   Bu script'ten sonra tabloların sahibi `postgres` olur, stok_user yalnızca
--   GRANT edilen CRUD haklarına sahip olur (CREATE/ALTER/DROP TABLE hakkı
--   YOK). `prisma migrate dev/deploy` gibi şema değiştiren komutlar artık
--   ADMIN_DATABASE_URL benzeri bir bağlantı (postgres rolü) gerektirir —
--   tıpkı CI'daki ADMIN_DATABASE_URL/DATABASE_URL ayrımı gibi:
--     DATABASE_URL="postgresql://postgres:postgres@localhost:5432/stok_dev" \
--       npx prisma migrate dev
--   Yeni bir migration sonrası, o migration'ın oluşturduğu YENİ tablolar için
--   aşağıdaki GRANT bloğunu ilgili veritabanına karşı tekrar çalıştırmanız
--   gerekir (CI de bunu HER koşuda migrate deploy'dan SONRA zaten yapıyor).
--
-- Bu dosya idempotent olacak şekilde yazıldı — birden fazla kez çalıştırmak
-- güvenlidir (var olan rolü/ownership'i bozmaz, yalnızca yeniden uygular).

-- 1) CI'daki yönetici rolü (ADMIN_DATABASE_URL) burada da var olsun.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres WITH LOGIN SUPERUSER PASSWORD 'postgres';
  END IF;
END
$$;

-- 2) Veritabanının kendi sahipliğini taşı.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I OWNER TO postgres', current_database());
END
$$;

-- 3) Şemanın ve içindeki her tablo/sekansın sahipliğini tek tek postgres'e
-- devret. BİLEREK blanket `REASSIGN OWNED BY stok_user TO postgres`
-- KULLANILMIYOR — bu container'da stok_user, Postgres'in İLK (initdb/
-- bootstrap) rolü olduğu için (POSTGRES_USER=stok_user ile kuruldu, ayrı bir
-- "postgres" rolü hiç var olmadı) o komut ampirik olarak "cannot reassign
-- ownership of objects owned by role stok_user because they are required by
-- the database system" hatasıyla reddediliyor. Tek tek ALTER SCHEMA/TABLE/
-- SEQUENCE OWNER TO ise sorunsuz çalışıyor — bu yüzden onun yerine kullanılıyor.
ALTER SCHEMA public OWNER TO postgres;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO postgres', r.tablename);
  END LOOP;

  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO postgres', r.sequencename);
  END LOOP;
END
$$;

-- 4) GRANT'lar ayrı bir dosyada (grant_stok_user.sql) — o dosya her
-- migration sonrası TEK BAŞINA da tekrar çalıştırılabilir olsun diye
-- (bkz. scripts/db-migrate.sh). `\ir` (include relative), `\i`'den farklı
-- olarak BU DOSYANIN bulunduğu dizine göre çözümlenir — psql'in nereden
-- çalıştırıldığından bağımsız çalışır (elle çalıştırma, docker init script'i, ...).
\ir grant_stok_user.sql

-- 5) EN SON: stok_user'ın kendi ayrıcalıklarını düşür — CI'daki
-- `CREATE ROLE stok_user LOGIN PASSWORD ...`nin ürettiği varsayılan
-- (kısıtlı) profille birebir aynı: superuser/createdb/createrole/
-- replication/bypassrls hepsi kapalı, yalnızca LOGIN açık.
ALTER ROLE stok_user WITH
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;
