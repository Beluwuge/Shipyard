import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const CODEX_VERSION = 'codex-cli 0.148.0';
export const schemaDirectory = fileURLToPath(new URL('./protocol/', import.meta.url));
const version = execFileSync('codex', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
if (version !== CODEX_VERSION) throw new Error(`Expected ${CODEX_VERSION}; received ${version}`);
const temporary = mkdtempSync(join(tmpdir(), 'shipyard-schema-'));
try {
  execFileSync('codex', ['app-server', 'generate-json-schema', '--out', temporary], { stdio: 'ignore' });
  const methods = new Set(['initialize', 'thread/start', 'thread/resume', 'thread/read', 'turn/start', 'turn/interrupt', 'skills/list', 'model/list', 'mcpServerStatus/list',
    'item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/permissions/requestApproval', 'item/tool/requestUserInput', 'mcpServer/elicitation/request']);
  const definitions = {};
  const requests = [];
  for (const file of ['ClientRequest.json', 'ServerRequest.json']) {
    const schema = JSON.parse(readFileSync(join(temporary, file), 'utf8'));
    Object.assign(definitions, schema.definitions);
    requests.push(...schema.oneOf.filter(item => methods.has(item.properties.method.enum[0])));
  }
  const needed = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref?.startsWith('#/definitions/')) {
      const key = value.$ref.slice('#/definitions/'.length);
      if (!needed.has(key)) { needed.add(key); visit(definitions[key]); }
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(requests);
  const bundle = { $schema: 'http://json-schema.org/draft-07/schema#',
    description: 'Generated request-only subset; unmodified reachable definitions from Codex CLI 0.148.0. Responses are observed by the proof.',
    oneOf: requests, definitions: Object.fromEntries([...needed].sort().map(key => [key, definitions[key]])) };
  const content = `${JSON.stringify(bundle, null, 2)}\n`;
  const sha256 = createHash('sha256').update(content).digest('hex');
  if (process.argv.includes('--check')) {
    const committed = readFileSync(join(schemaDirectory, 'requests.json'), 'utf8');
    if (committed !== content) throw new Error('Pinned protocol differs from installed Codex');
    console.log(`Pinned schema matches ${version}: ${sha256}`);
  } else {
    mkdirSync(schemaDirectory, { recursive: true });
    writeFileSync(join(schemaDirectory, 'requests.json'), content);
    writeFileSync(join(schemaDirectory, 'manifest.json'), `${JSON.stringify({ codex: version, sha256, methods: requests.map(item => item.properties.method.enum[0]) }, null, 2)}\n`);
    console.log(`Captured ${requests.length} request schemas from ${version}`);
  }
} finally { rmSync(temporary, { recursive: true, force: true }); }
