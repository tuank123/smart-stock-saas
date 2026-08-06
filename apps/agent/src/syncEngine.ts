import { apiClient } from './apiClient';
import { config } from './config';

interface SyncJob {
  id: string;
  operationType: string;
  payload: unknown;
  adapterType: string;
  createdAt: string;
}

// Bekleyen OUTBOUND işleri çek, (şimdilik) doğrudan başarılı olarak işaretle.
async function pollOutbound(): Promise<void> {
  try {
    const { data: jobs } = await apiClient.get<SyncJob[]>('/agent/sync-queue');

    if (!jobs.length) return;
    console.log(`📥 ${jobs.length} bekleyen iş alındı.`);

    for (const job of jobs) {
      console.log(`   → ${job.operationType} (id=${job.id}, adapter=${job.adapterType})`);

      // TODO: Bay.t Capital adaptörü buraya bağlanacak.
      // Şimdilik gerçek adaptör çağrısı YOK — her işi geçici olarak
      // başarılı işaretliyoruz. Gerçek adaptör gelince burası değişecek.
      try {
        await apiClient.post(`/agent/sync-queue/${job.id}/ack`, { success: true });
      } catch (err) {
        console.error(`   ✗ ack başarısız (id=${job.id}):`, describeError(err));
      }
    }
  } catch (err) {
    console.error('poll hatası:', describeError(err));
  }
}

// Agent canlılık bildirimi.
async function sendHeartbeat(): Promise<void> {
  try {
    await apiClient.post('/agent/heartbeat', { status: 'idle' });
  } catch (err) {
    console.error('heartbeat hatası:', describeError(err));
  }
}

function describeError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

// Döngüyü başlat: config.POLLING_INTERVAL_SEC saniyede bir poll + heartbeat.
export function startSyncEngine(): void {
  const intervalMs = config.POLLING_INTERVAL_SEC * 1000;

  const tick = () => {
    void pollOutbound();
    void sendHeartbeat();
  };

  tick(); // ilk çalıştırmayı beklemeden yap
  setInterval(tick, intervalMs);

  console.log(`🔁 Senkronizasyon döngüsü başladı (her ${config.POLLING_INTERVAL_SEC} sn).`);
}
