import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Only Serve may be treated as the identity proxy. Loopback is a local trust
// boundary, not authentication against other processes on this machine.
export function identityDecision(rawHeaders, owner) {
  const values = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === 'tailscale-user-login') values.push(rawHeaders[i + 1]);
  }
  if (values.length !== 1 || !values[0]) return 'missing-or-ambiguous-identity';
  return values[0] === owner ? 'owner' : 'different-identity';
}

export function createProofServer({ owner, port, name = 'unit-test' }) {
  if (typeof owner !== 'string' || !owner || /[\s,\r\n]/u.test(owner)) throw new Error('Invalid owner login');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const instance = randomUUID();
  const startedAt = new Date().toISOString();
  const server = http.createServer((request, response) => {
    const decision = identityDecision(request.rawHeaders, owner);
    const status = request.method !== 'GET' ? 405 : request.url !== '/identity' ? 404 : decision === 'owner' ? 200 : 403;
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    // Never echo raw identity, client headers, tokens, or local filesystem paths.
    response.end(JSON.stringify({ proof: 'SHIP-002', name, decision, instance, startedAt, pid: process.pid, uid: process.getuid?.() }));
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxHeadersCount = 32;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const server = createProofServer(config);
  server.listen(config.port, '127.0.0.1', () => console.log(JSON.stringify({ event: 'listening', ...server.address() })));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
