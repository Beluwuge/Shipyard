import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { AppServerClient } from '../client.mjs';

test('mock creates an unapproved draft idempotently and rejects changed retries or approval', async t => {
  const client = new AppServerClient({ command: process.execPath,
    args: [fileURLToPath(new URL('../mock-shipyard.mjs', import.meta.url))] });
  t.after(() => client.close());
  const initialized = await client.request('initialize', { protocolVersion: '2024-11-05' });
  assert.equal(initialized.serverInfo.name, 'shipyard-proof-mock');
  const tools = await client.request('tools/list');
  assert.equal(tools.tools[0].name, 'create_run');
  const args = { hostId: 'host', project: 'example/repo', ticket: 'Greeting', requestKey: 'one', criteriaApproved: false };
  const call = arguments_ => client.request('tools/call', { name: 'create_run', arguments: arguments_ });
  const first = JSON.parse((await call(args)).content[0].text);
  const repeated = JSON.parse((await call(Object.fromEntries(Object.entries(args).reverse()))).content[0].text);
  assert.equal(first.runId, repeated.runId);
  assert.equal(first.criteriaApproved, false);
  assert.equal(first.phase, 'draft');
  assert.equal(new URL(first.dashboardUrl).hostname, 'shipyard.example.test');
  await assert.rejects(call({ ...args, ticket: 'Changed' }));
  await assert.rejects(call({ ...args, criteriaApproved: true }));
  await assert.rejects(call({ ...args, hostId: '' }));
});
