import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AppServerClient } from './client.mjs';

const version = execFileSync('codex', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
if (version !== 'codex-cli 0.148.0') throw new Error('Pinned Codex version required');
const workdir = mkdtempSync(join(tmpdir(), 'shipyard-wire-'));
execFileSync('git', ['init', '--quiet', workdir]);
class MetadataClient extends AppServerClient {
  send(message) { this.capture('client', message); super.send(message); }
  receive(message) { this.capture('server', message); super.receive(message); }
  capture(direction, message) {
    // A structural projection, deliberately excluding all text/value payloads.
    if (!message.method && !Object.hasOwn(message, 'id')) return;
    this.trace?.push({ direction, ...(message.method ? { method: message.method } : {}),
      hasId: Object.hasOwn(message, 'id'),
      ...(message.params ? { paramsKeys: Object.keys(message.params).sort() } : {}),
      ...(message.result ? { resultKeys: Object.keys(message.result).sort() } : {}),
      ...(message.error ? { errorCode: message.error.code } : {}) });
  }
}
const client = new MetadataClient({ cwd: workdir,
  args: ['app-server', '--listen', 'stdio://', '-c', 'features.apps=false'] });
client.trace = [];
try {
  await client.initialize();
  await client.request('model/list', {});
  await client.request('thread/start', { cwd: workdir, ephemeral: true, sandbox: 'read-only', approvalPolicy: 'on-request' });
} finally { await client.close(); }
const output = resolve('.shipyard-proof');
mkdirSync(output, { recursive: true, mode: 0o700 });
writeFileSync(join(output, 'wire-metadata.json'), `${JSON.stringify({ codex: version,
  description: 'Observed frame metadata, not a replayable raw transcript. No payload values retained.',
  frames: client.trace }, null, 2)}\n`, { mode: 0o600 });
console.log(`Captured ${client.trace.length} sanitized frame projections`);
