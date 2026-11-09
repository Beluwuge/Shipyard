import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createProofServer, identityDecision } from '../server.mjs';
import { accountAssessment, supervisorDefinition } from '../platform.mjs';

test('owner policy rejects absent, other, duplicate, and noncanonical identities', () => {
  const owner = 'owner@example.invalid';
  assert.equal(identityDecision([], owner), 'missing-or-ambiguous-identity');
  assert.equal(identityDecision(['Tailscale-User-Login', owner], owner), 'owner');
  for (const value of ['other@example.invalid', 'OWNER@example.invalid', `${owner}, other@example.invalid`]) {
    assert.equal(identityDecision(['tailscale-user-login', value], owner), 'different-identity');
  }
  assert.equal(identityDecision(['Tailscale-User-Login', owner, 'tailscale-user-login', owner], owner), 'missing-or-ambiguous-identity');
});

test('real listener is IPv4 loopback only and has read-only identity responses', async t => {
  const owner = 'owner@example.invalid';
  const server = createProofServer({ owner, port: 0 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  assert.equal(server.address().address, '127.0.0.1');
  const url = `http://127.0.0.1:${server.address().port}/identity`;
  assert.equal((await fetch(url)).status, 403);
  assert.equal((await fetch(url, { headers: { 'Tailscale-User-Login': 'other@example.invalid' } })).status, 403);
  const accepted = await fetch(url, { headers: { 'Tailscale-User-Login': owner } });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get('cache-control'), 'no-store');
  assert.ok(!(await accepted.text()).includes(owner));
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Tailscale-User-Login': owner } })).status, 405);
  assert.equal((await fetch(url.replace('/identity', '/other'))).status, 404);
  // A process already on the trusted host can forge headers. Do not claim
  // loopback is an authentication boundary against local users.
  const duplicate = await new Promise((resolve, reject) => {
    const request = http.get(url, { headers: ['Host', '127.0.0.1', 'Tailscale-User-Login', owner, 'tailscale-user-login', owner] }, response => {
      response.resume(); resolve(response.statusCode);
    });
    request.on('error', reject);
  });
  assert.equal(duplicate, 403);
});

test('privileged groups and root never qualify; group screen is not delegation audit', () => {
  for (const group of ['admin', 'sudo', 'wheel', 'docker', 'lxd', 'incus-admin', 'disk']) assert.equal(accountAssessment(1000, [group]).groupScreenPassed, false);
  assert.equal(accountAssessment(0, []).groupScreenPassed, false);
  assert.equal(accountAssessment(1000, ['users']).groupScreenPassed, true);
  assert.equal(accountAssessment(1000, ['users']).nonAdminVerified, false);
});

test('generated supervisors quote spaces and reject executable/configuration injection', () => {
  const args = { name: 'shipyard-proof-012345abcdef', node: '/usr/bin/node', script: '/home/a b/server.mjs', config: '/home/a b/config.json', directory: '/home/a b' };
  assert.match(supervisorDefinition({ ...args, platform: 'linux' }), /ExecStart="\/usr\/bin\/node" "\/home\/a b\/server.mjs"/u);
  assert.match(supervisorDefinition({ ...args, platform: 'darwin' }), /<key>RunAtLoad<\/key><true\/>/u);
  assert.match(supervisorDefinition({ ...args, platform: 'darwin', node: '/opt/homebrew/Cellar/node@22/22.22.2/bin/node' }), /node@22/u);
  for (const value of ['/tmp/evil\nExecStart=bad', '/tmp/%n', '/tmp/$HOME', '/tmp/"evil', '/tmp/../elsewhere', '/tmp/..']) {
    assert.throws(() => supervisorDefinition({ ...args, platform: 'linux', script: value }));
  }
  assert.throws(() => supervisorDefinition({ ...args, platform: 'win32' }));
  assert.throws(() => supervisorDefinition({ ...args, platform: 'linux', name: 'other.service' }));
});
