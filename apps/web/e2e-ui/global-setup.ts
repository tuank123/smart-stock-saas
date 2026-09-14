import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// global-teardown.ts'in "bu koşuda ÜRETİLEN tenant'lar" kriterini
// uygulayabilmesi için başlangıç zamanını kaydeder — os.tmpdir()'e yazılır,
// repoyu kirletmez, teardown işini bitirince siler.
export const RUN_START_FILE = path.join(os.tmpdir(), 'stokpilot-e2e-ui-run-start.json');

export default function globalSetup() {
  fs.writeFileSync(RUN_START_FILE, JSON.stringify({ startedAt: new Date().toISOString() }));
}
