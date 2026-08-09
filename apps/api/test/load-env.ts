/**
 * Jest `setupFiles` girdisi — test modül grafiği YÜKLENMEDEN ÖNCE çalışır.
 *
 * Bu sıralama kritik: AppModule'ün ConfigModule'ü `.env.local`'i okuyor ve
 * `.env.local` geliştirme veritabanını (stok_dev) gösteriyor. @nestjs/config
 * yalnızca `process.env`'de HENÜZ OLMAYAN anahtarları yazar
 * (assignVariablesToProcess → `keys.filter(key => !(key in process.env))`),
 * dolayısıyla `.env.test`'i burada önden yüklersek test veritabanı kazanır.
 *
 * Aynı dosya bir de güvenlik freni koyar: DATABASE_URL yanlışlıkla dev
 * veritabanını gösteriyorsa testler hiç başlamadan durur.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

const ENV_TEST_PATH = path.resolve(__dirname, '../.env.test');

dotenv.config({ path: ENV_TEST_PATH });

process.env.NODE_ENV = 'test';

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error(
    `DATABASE_URL tanımlı değil. ${ENV_TEST_PATH} dosyasını oluşturun (bkz. test/README.md).`,
  );
}

// Güvenlik freni: testler veriyi siler, asla geliştirme/üretim DB'sine bağlanmasın.
const dbName = dbUrl.split('/').pop()?.split('?')[0] ?? '';

if (!dbName.includes('test')) {
  throw new Error(
    `Test veritabanı adı 'test' içermeli, bulunan: '${dbName}'.\n` +
      `Testler veri siliyor — yanlışlıkla geliştirme veritabanına bağlanmayı önlemek için durduruldu.\n` +
      `${ENV_TEST_PATH} içindeki DATABASE_URL'i kontrol edin.`,
  );
}
