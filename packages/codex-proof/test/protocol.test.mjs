import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AppServerClient } from '../client.mjs';
import { proofApprovalHandler, commandProbeSucceeded } from '../approvals.mjs';

function fake(t, options = {}) {
  const client = new AppServerClient({ command: process.execPath,
    args: [fileURLToPath(new URL('./fake-server.mjs', import.meta.url))], timeoutMs: 1000, ...options });
  t.after(() => client.close());
  return client;
}
test('matches concurrent responses and retains notifications emitted before the response', async t => {
  const client = fake(t);
  await client.initialize();
  const cursor = client.cursor();
  const [early, echo] = await Promise.all([client.request('early'), client.request('echo', { n: 3 })]);
  assert.deepEqual(early, { ok: true });
  assert.deepEqual(echo, { n: 3 });
  const event = await client.waitFor(event => event.method === 'done', cursor);
  assert.equal(event.params.ok, true);
  await assert.rejects(client.waitFor(event => event.method === 'done', client.cursor(), 10), /Timed out/);
});
test('upstream errors do not disclose their raw message', async t => {
  const client = fake(t);
  await assert.rejects(client.request('fail'), error => error.message === 'RPC fail failed (-32000)');
});
test('exit rejects outstanding requests and waiters immediately', async t => {
  const client = fake(t);
  const waiting = client.waitFor(() => false);
  const request = client.request('exit');
  const results = await Promise.allSettled([waiting, request]);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.equal(client.pending.size, 0);
  assert.equal(client.waiters.size, 0);
  await assert.rejects(client.request('echo'), /closed/);
});
test('request timeout is uncertain and does not retry the command', async t => {
  const client = fake(t, { timeoutMs: 30 });
  await assert.rejects(client.request('timeout'), /outcome unknown/);
  assert.equal(client.nextId, 2);
  assert.equal(client.pending.size, 0);
});
test('server-initiated approvals are handled separately from client response IDs', async t => {
  const client = fake(t, { onRequest: proofApprovalHandler({ threadId: 'proof', enabled: true }) });
  assert.deepEqual(await client.request('approval'), { decision: 'accept' });
});
test('approval handler refuses disabled, wrong-thread and unsupported permissions requests', async () => {
  const request = { method: 'item/commandExecution/requestApproval', params: { threadId: 'proof' } };
  await assert.rejects(proofApprovalHandler({ threadId: 'proof' })(request));
  const handler = proofApprovalHandler({ threadId: 'proof', enabled: true });
  await assert.rejects(handler({ ...request, params: { threadId: 'other' } }));
  await assert.rejects(handler({ method: 'item/permissions/requestApproval', params: { threadId: 'proof' } }));
  await assert.rejects(handler({ ...request, params: { threadId: 'proof', availableDecisions: ['decline'] } }));
  assert.deepEqual(await handler(request), { decision: 'accept' });
});
test('pinned request schemas have complete references and match their recorded digest', () => {
  const bytes = readFileSync(new URL('../protocol/requests.json', import.meta.url));
  const manifest = JSON.parse(readFileSync(new URL('../protocol/manifest.json', import.meta.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
  const bundle = JSON.parse(bytes);
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) assert.ok(bundle.definitions[value.$ref.replace('#/definitions/', '')], value.$ref);
    Object.values(value).forEach(walk);
  };
  walk(bundle);
  assert.ok(manifest.methods.includes('turn/interrupt'));
  assert.ok(manifest.methods.includes('item/permissions/requestApproval'));
});

test('diagnostic approval accepts only the unapproved draft from the known mock and thread', async () => {
  const handler = proofApprovalHandler({ threadId: 'proof', allowMockDraft: true });
  const params = { threadId: 'proof', serverName: 'shipyard', mode: 'form', requestedSchema: { properties: {} },
    _meta: { tool_params: { hostId: 'proof-host', project: 'example/disposable', criteriaApproved: false } } };
  const request = { method: 'mcpServer/elicitation/request', params };
  assert.deepEqual(await handler(request), { action: 'accept', content: {} });
  await assert.rejects(handler({ ...request, params: { ...params, serverName: 'other' } }));
  await assert.rejects(handler({ ...request, params: { ...params, threadId: 'other' } }));
  await assert.rejects(handler({ ...request, params: { ...params, _meta: { tool_params: { ...params._meta.tool_params, criteriaApproved: true } } } }));
  await assert.rejects(handler({ ...request, params: { ...params, requestedSchema: { properties: { secret: {} } } } }));
});

test('completed conversation alone cannot pass the command-execution proof', () => {
  const event = { sequence: 3, method: 'item/completed', params: { item: { type: 'commandExecution',
    status: 'completed', exitCode: 0, aggregatedOutput: 'SHIPYARD_APPROVAL_PROOF' } } };
  assert.equal(commandProbeSucceeded([event], 0), true);
  assert.equal(commandProbeSucceeded([event], 4), false);
  assert.equal(commandProbeSucceeded([{ ...event, params: { item: { ...event.params.item, exitCode: 1 } } }], 0), false);
  assert.equal(commandProbeSucceeded([{ ...event, params: { item: { ...event.params.item, aggregatedOutput: '' } } }], 0), false);
  assert.equal(commandProbeSucceeded([{ sequence: 3, method: 'turn/completed', params: { turn: { status: 'completed' } } }], 0), false);
});
