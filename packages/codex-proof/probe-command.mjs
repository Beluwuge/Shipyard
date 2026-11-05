export const probeCommand = 'node -e \'process.stdout.write("SHIPYARD_APPROVAL_PROOF")\'';
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const doubleQuote = value => `"${value.replace(/["\\$`]/g, '\\$&')}"`;
const allowed = new Set([probeCommand]);
for (const shell of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
  for (const option of ['-c', '-lc']) {
    allowed.add(`${shell} ${option} ${quote(probeCommand)}`);
    allowed.add(`${shell} ${option} ${doubleQuote(probeCommand)}`);
  }
}

export function isProbeApproval(request) {
  const params = request.params;
  return request.method === 'item/commandExecution/requestApproval' &&
    allowed.has(params?.command) && !params.additionalPermissions && !params.networkApprovalContext;
}
