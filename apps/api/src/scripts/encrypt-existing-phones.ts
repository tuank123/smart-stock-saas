/**
 * Tek seferlik migrasyon: mevcut Branch.phone kayıtlarını AES-256-GCM ile şifreler.
 *
 * Kullanım:
 *   ts-node src/scripts/encrypt-existing-phones.ts          (uygular)
 *   ts-node src/scripts/encrypt-existing-phones.ts --dry-run (sadece raporlar)
 *
 * Kolon tipi zaten String olduğu için migration gerekmez — yalnızca içerik
 * formatı değişir. Zaten "iv:authTag:ciphertext" formatındaki kayıtlar
 * atlanır, bu yüzden script birden fazla kez çalıştırılabilir (idempotent).
 * RLS, is_super_admin='true' ile bypass edilir (diğer script'lerle aynı desen).
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // fallback, üzerine yazmaz

import { PrismaClient } from '@prisma/client';
import { encrypt, isEncrypted } from '../common/utils/encryption';
import { withTenantContext } from '../common/utils/tenant-context';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();

  // ENCRYPTION_KEY yoksa/bozuksa hiç başlamadan patlasın.
  encrypt('kontrol');

  try {
    const branches = await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
      return tx.branch.findMany({ select: { id: true, name: true, phone: true } });
    });

    const pending = branches.filter((b) => b.phone && !isEncrypted(b.phone));
    const already = branches.filter((b) => b.phone && isEncrypted(b.phone));
    const empty = branches.length - pending.length - already.length;

    console.log(`Toplam şube          : ${branches.length}`);
    console.log(`Telefonu boş         : ${empty}`);
    console.log(`Zaten şifreli        : ${already.length} (atlanacak)`);
    console.log(`Şifrelenecek         : ${pending.length}`);

    if (pending.length === 0) {
      console.log('\n✅ Yapılacak bir şey yok.');
      return;
    }

    if (dryRun) {
      console.log('\n--dry-run: hiçbir kayıt değiştirilmedi. Etkilenecekler:');
      pending.forEach((b) => console.log(`  - ${b.name} (${b.id})`));
      return;
    }

    await withTenantContext(prisma, { isSuperAdmin: true }, async (tx) => {
      for (const branch of pending) {
        await tx.branch.update({
          where: { id: branch.id },
          data: { phone: encrypt(branch.phone as string) },
        });
        console.log(`  ✔ ${branch.name} (${branch.id})`);
      }
    });

    console.log(`\n✅ ${pending.length} şube telefonu şifrelendi.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ Hata:', e.message);
  process.exit(1);
});
