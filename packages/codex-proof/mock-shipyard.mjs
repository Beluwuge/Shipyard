import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Disposable MCP contract fixture. This never launches jobs or contacts a backend.
const receiptPath = process.argv[2];
const drafts = new Map();
const inputSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    hostId: { type: 'string', minLength: 1 }, project: { type: 'string', minLength: 1 },
    ticket: { type: 'string', minLength: 1 }, requestKey: { type: 'string', minLength: 1 },
    criteriaApproved: { type: 'boolean', const: false },
  }, required: ['hostId', 'project', 'ticket', 'requestKey', 'criteriaApproved'],
};
function call(args) {
  if (!args || Object.keys(args).some(key => !Object.hasOwn(inputSchema.properties, key)) ||
      ['hostId', 'project', 'ticket', 'requestKey'].some(key => typeof args[key] !== 'string' || !args[key].trim()) ||
      args.criteriaApproved !== false) throw new Error('Invalid draft request');
  const previous = drafts.get(args.requestKey);
  const fingerprint = JSON.stringify(Object.fromEntries(Object.keys(inputSchema.properties).map(key => [key, args[key]])));
  if (previous && previous.input !== fingerprint) throw new Error('Request key conflict');
  const result = previous?.result ?? { runId: randomUUID(), phase: 'draft', criteriaApproved: false, mock: true };
  result.dashboardUrl = `https://shipyard.example.test/runs/${result.runId}`;
  drafts.set(args.requestKey, { input: fingerprint, result });
  if (receiptPath) writeFileSync(receiptPath, JSON.stringify({ result, hostId: args.hostId, project: args.project }), { mode: 0o600 });
  return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false };
}
for await (const line of createInterface({ input: process.stdin })) {
  let request;
  try { request = JSON.parse(line); } catch { continue; }
  if (!Object.hasOwn(request, 'id')) continue;
  let result;
  try {
    switch (request.method) {
      case 'initialize': result = { protocolVersion: request.params.protocolVersion,
        capabilities: { tools: {} }, serverInfo: { name: 'shipyard-proof-mock', version: '0.1.0' } }; break;
      case 'ping': result = {}; break;
      case 'tools/list': result = { tools: [{ name: 'create_run',
        description: 'Create a disposable Shipyard proof draft; no execution or production service.', inputSchema }] }; break;
      case 'tools/call':
        if (request.params?.name !== 'create_run') throw new Error('Unknown tool');
        result = call(request.params.arguments); break;
      default: throw new Error('Unknown method');
    }
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id,
      error: { code: -32602, message: 'Invalid or unsupported proof request' } })}\n`);
  }
}
