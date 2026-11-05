import test from 'node:test';
import assert from 'node:assert/strict';
import { probeCommand, isProbeApproval } from '../probe-command.mjs';
import { proofApprovalHandler } from '../approvals.mjs';

test('local approval allows only the literal probe without privilege or network overlays', async () => {
  const request = { method: 'item/commandExecution/requestApproval', params: { threadId: 'local', command: probeCommand } };
  const handler = proofApprovalHandler({ threadId: 'local', enabled: true, commandFilter: isProbeApproval });
  assert.deepEqual(await handler(request), { decision: 'accept' });
  const wrapper = `/bin/zsh -lc "${probeCommand.replaceAll('"', '\\"')}"`;
  assert.deepEqual(await handler({ ...request, params: { ...request.params, command: wrapper } }), { decision: 'accept' });
  for (const command of [`${probeCommand}; touch /tmp/other`, `sudo ${probeCommand}`, `echo ${probeCommand}`, 'node --version']) {
    await assert.rejects(handler({ ...request, params: { ...request.params, command } }));
  }
  for (const overlay of [{ additionalPermissions: {} }, { networkApprovalContext: {} }]) {
    await assert.rejects(handler({ ...request, params: { ...request.params, ...overlay } }));
  }
  await assert.rejects(handler({ method: 'item/fileChange/requestApproval', params: { threadId: 'local' } }));
});
