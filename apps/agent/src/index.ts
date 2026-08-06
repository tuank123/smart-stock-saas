import { config } from './config'; // import edilince AGENT_ID/AGENT_API_KEY doğrulanır
import { startSyncEngine } from './syncEngine';

console.log('🚀 StokPilot Agent başlatıldı');
console.log(`   API: ${config.STOKPILOT_API_URL}`);
console.log(`   Agent ID: ${config.AGENT_ID}`);

startSyncEngine();
