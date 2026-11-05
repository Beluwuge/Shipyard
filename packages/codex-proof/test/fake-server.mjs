import { createInterface } from 'node:readline';
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`);
let approvalRequest;
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.id === 'server-approval' && !request.method) {
    send({ id: approvalRequest, result: request.result ?? request.error }); continue;
  }
  if (!request.method || !Object.hasOwn(request, 'id')) continue;
  switch (request.method) {
    case 'initialize': send({ id: request.id, result: {} }); break;
    case 'early':
      send({ method: 'done', params: { ok: true } });
      send({ id: request.id, result: { ok: true } }); break;
    case 'fail': send({ id: request.id, error: { code: -32000, message: 'SECRET-UPSTREAM-DATA' } }); break;
    case 'exit': process.exit(0); break;
    case 'timeout': break;
    case 'approval':
      approvalRequest = request.id;
      send({ id: 'server-approval', method: 'item/commandExecution/requestApproval', params: { threadId: 'proof' } }); break;
    default: send({ id: request.id, result: request.params });
  }
}
