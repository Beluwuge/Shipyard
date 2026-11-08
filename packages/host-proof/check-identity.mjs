// Run from a different Tailnet device. HTTPS certificate verification remains on.
const [serveURL, directURL] = process.argv.slice(2);
if (!serveURL || new URL(serveURL).protocol !== 'https:' || !directURL || new URL(directURL).protocol !== 'http:') {
  throw new Error('Usage: check-identity.mjs https://serve-host:port/identity http://target-ip:backend-port/identity');
}
const observations = [];
for (const [label, headers] of [
  ['normal', {}],
  ['spoof-other', { 'Tailscale-User-Login': 'not-owner@example.invalid' }],
  ['spoof-owner', { 'Tailscale-User-Login': process.env.SHIPYARD_PROOF_OWNER || 'owner@example.invalid' }],
]) {
  const response = await fetch(serveURL, { headers, signal: AbortSignal.timeout(10000), redirect: 'error' });
  const body = await response.json();
  if (body.proof !== 'SHIP-002') throw new Error('Unexpected service response');
  observations.push({ label, status: response.status, decision: body.decision, instance: body.instance });
}
let direct;
try {
  const response = await fetch(directURL, {
    headers: { 'Tailscale-User-Login': process.env.SHIPYARD_PROOF_OWNER || 'owner@example.invalid' },
    signal: AbortSignal.timeout(5000), redirect: 'error',
  });
  direct = { reachable: true, status: response.status };
} catch (error) {
  direct = { reachable: false, reason: error.cause?.code || error.name };
}
const consistent = observations.every(item => item.status === observations[0].status && item.decision === observations[0].decision && item.instance === observations[0].instance);
const expected = process.env.SHIPYARD_PROOF_EXPECT || 'owner';
const expectedStatus = expected === 'owner' ? 200 : 403;
const passed = consistent && observations[0].decision === expected && observations[0].status === expectedStatus && !direct.reachable;
console.log(JSON.stringify({ proof: 'SHIP-002', expected, observations, direct,
  clientHeadersDoNotChangeDecision: consistent, passed,
  limitations: ['Connection failure alone does not prove listener binding; inspect target sockets.', 'This records only the real identity of the invoking device.'] }, null, 2));
if (!passed) process.exitCode = 1;
