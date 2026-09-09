-- stok_user'a CRUD haklarını (yeniden) verir. restrict_stok_user.sql'den
-- BİLEREK AYRI: o script YALNIZCA BİR KEZ çalıştırılır (ownership devri +
-- stok_user'ı kısıtlama), bu script ise HER şema migration'ından SONRA
-- tekrar tekrar çalıştırılmalıdır — yeni migration = yeni tablo/sekans =
-- stok_user'ın o nesneler için henüz GRANT'ı yok demektir (stok_user artık
-- tablo sahibi olmadığından yeni tablolar otomatik ona ait olmaz).
--
-- CI'daki ".github/workflows/ci.yml" > "Yetkisiz stok_user rolünü oluştur"
-- adımındaki GRANT'larla BİREBİR aynı.
--
-- postgres (admin) rolüyle çalıştırılmalı — stok_user'ın başkasına GRANT
-- verme yetkisi yok. Normalde elle çalıştırmanıza gerek kalmaz:
-- `pnpm db:migrate:dev` / `db:migrate:deploy` (scripts/db-migrate.sh) her
-- migration sonrası bunu otomatik uygular.
GRANT USAGE ON SCHEMA public TO stok_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO stok_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO stok_user;
