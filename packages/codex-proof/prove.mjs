import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, accessSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppServerClient } from './client.mjs';
import { proofApprovalHandler, commandProbeSucceeded } from './approvals.mjs';

const diagnostic = process.argv.includes('--diagnostic');
const modelIndex = process.argv.indexOf('--model');
const selectedModel = modelIndex >= 0 ? process.argv[modelIndex + 1] : undefined;
if (modelIndex >= 0 && (!selectedModel || selectedModel.startsWith('--'))) throw new Error('--model needs an explicit model ID');
const groups = execFileSync('id', ['-Gn'], { encoding: 'utf8' }).trim().split(/\s+/);
const nonAdmin = process.getuid?.() !== 0 && !groups.some(group => ['root', 'admin', 'sudo', 'wheel'].includes(group));
if (!nonAdmin && !diagnostic) throw new Error('Full proof requires a non-admin account. --diagnostic runs text/MCP checks only and cannot satisfy that requirement.');
const version = execFileSync('codex', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
if (version !== 'codex-cli 0.148.0') throw new Error('Codex version mismatch; use the pinned version or explicitly review and recapture the protocol.');
const output = resolve('.shipyard-proof');
mkdirSync(output, { recursive: true, mode: 0o700 });
const workdir = mkdtempSync(join(tmpdir(), 'shipyard-codex-proof-'));
execFileSync('git', ['init', '--quiet', workdir]);
const skillPath = join(workdir, '.agents/skills/workflow/SKILL.md');
mkdirSync(join(workdir, '.agents/skills/workflow'), { recursive: true });
copyFileSync(fileURLToPath(new URL('../workflow/skills/workflow/SKILL.md', import.meta.url)), skillPath);
const receiptPath = join(workdir, 'mock-receipt.json');
const mockPath = fileURLToPath(new URL('./mock-shipyard.mjs', import.meta.url));
const args = ['app-server', '--listen', 'stdio://', '-c', 'features.apps=false',
  '-c', `mcp_servers.shipyard.command=${JSON.stringify(process.execPath)}`,
  '-c', `mcp_servers.shipyard.args=${JSON.stringify([mockPath, receiptPath])}`];
const report = { codex: version, node: process.version, platform: process.platform,
  nonAdminAccount: nonAdmin, diagnostic, selectedModel: selectedModel ?? null, checks: {}, automaticApprovals: {}, limitations: [] };
let client;
let threadId;
const makeClient = () => new AppServerClient({ args, cwd: workdir, timeoutMs: 120_000 });
const textInput = text => ({ type: 'text', text, text_elements: [] });
async function turn(input, overrides = {}) {
  const cursor = client.cursor();
  const { turn: started } = await client.request('turn/start', { threadId, input,
    ...(selectedModel ? { model: selectedModel } : {}), ...overrides });
  const done = await client.waitFor(event => event.method === 'turn/completed' &&
    event.params.threadId === threadId && event.params.turn.id === started.id, cursor);
  return { status: done.params.turn.status, started, cursor };
}
function check(name, condition) { report.checks[name] = condition ? 'pass' : 'fail'; }
try {
  client = makeClient();
  let rejected = false;
  try { await client.request('model/list'); } catch { rejected = true; }
  check('rejectsBeforeInitialize', rejected);
  await client.initialize();
  const config = { cwd: workdir, sandbox: diagnostic ? 'read-only' : 'workspace-write',
    approvalPolicy: diagnostic ? 'on-request' : 'untrusted', approvalsReviewer: 'user',
    developerInstructions: 'This is a disposable Shipyard protocol proof. Do not read outside the working directory. Use the Shipyard mock only when requested. Do not invoke shell or file tools unless the user explicitly requests the approval probe.' };
  const started = await client.request('thread/start', config);
  const catalog = await client.request('model/list', {});
  report.catalog = catalog.data?.map(item => item.model) ?? [];
  threadId = started.thread.id;
  writeFileSync(join(output, 'session.json'), JSON.stringify({ threadId, workdir }), { mode: 0o600 });
  report.defaults = { model: started.model, effort: started.reasoningEffort ?? null,
    sandbox: config.sandbox, approvalPolicy: started.approvalPolicy, reviewer: started.approvalsReviewer };
  client.onRequest = proofApprovalHandler({ threadId, enabled: !diagnostic, allowMockDraft: true, record: method => {
    report.automaticApprovals[method] = (report.automaticApprovals[method] ?? 0) + 1;
  } });
  const first = await turn([textInput('Remember the proof token SHIPYARD-CONTINUITY-148. Reply only ACK. Do not use tools.')]);
  check('realTurn', first.status === 'completed');
  if (first.status !== 'completed') throw new Error('Real turn failed; no model is substituted automatically. Retry with an explicit --model after checking the local catalog.');
  check('streamedEvents', client.events.some(event => event.method === 'item/agentMessage/delta'));
  await client.close();
  client = makeClient();
  await client.initialize();
  threadId = JSON.parse(readFileSync(join(output, 'session.json'), 'utf8')).threadId;
  const resumed = await client.request('thread/resume', { ...config, threadId });
  check('sameThreadAfterRestart', resumed.thread.id === threadId);
  client.onRequest = proofApprovalHandler({ threadId, enabled: !diagnostic, allowMockDraft: true, record: method => {
    report.automaticApprovals[method] = (report.automaticApprovals[method] ?? 0) + 1;
  } });
  const second = await turn([textInput('Reply with the exact proof token from the preceding turn. Do not use tools.')]);
  const continuity = client.events.filter(event => event.sequence > second.cursor && event.method === 'item/agentMessage/delta')
    .map(event => event.params.delta).join('');
  check('conversationContinuity', second.status === 'completed' && continuity.includes('SHIPYARD-CONTINUITY-148'));
  const skills = await client.request('skills/list', { cwds: [workdir], forceReload: true });
  check('skillDiscovered', JSON.stringify(skills).includes(skillPath));
  let inventoryCursor;
  let mockReady = false;
  do {
    const inventory = await client.request('mcpServerStatus/list', { threadId, limit: 100, cursor: inventoryCursor });
    mockReady ||= inventory.data.some(server => server.name === 'shipyard' && Object.hasOwn(server.tools, 'create_run'));
    inventoryCursor = inventory.nextCursor;
  } while (inventoryCursor && !mockReady);
  check('mockToolReady', mockReady);
  if (!mockReady) throw new Error('Mock MCP tool not ready');
  let invocation = await turn([textInput('$workflow Create a proof draft for hostId=proof-host, project=example/disposable, ticket="Add a greeting", requestKey=shipyard-proof-one. Use the connected Shipyard create_run mock, leave criteriaApproved=false and return its dashboard URL. Do not use shell tools.'),
    { type: 'skill', name: 'workflow', path: skillPath }]);
  const invocationCursor = invocation.cursor;
  report.workflowAttempts = 1;
  // A completed model response without a receipt proves the known mock did not
  // create a draft. One explicit correction is allowed; never retry an uncertain turn.
  if (invocation.status === 'completed' && !existsSync(receiptPath)) {
    report.workflowFirstAttempt = 'no-confirmed-tool-call';
    report.workflowAttempts = 2;
    invocation = await turn([textInput('The disposable mock has received no request and no draft exists. Invoke its create_run tool now, rather than describing the call. Arguments: {"hostId":"proof-host","project":"example/disposable","ticket":"Add a greeting","requestKey":"shipyard-proof-one","criteriaApproved":false}. Return the actual tool URL. Do not use shell tools.'),
      { type: 'skill', name: 'workflow', path: skillPath }]);
  }
  const receipt = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) : null;
  check('workflowDraftTool', invocation.status === 'completed' && receipt?.result.phase === 'draft' &&
    receipt.result.criteriaApproved === false && receipt.hostId === 'proof-host' && receipt.project === 'example/disposable');
  const outputText = client.events.filter(event => event.sequence > invocationCursor && event.method === 'item/agentMessage/delta')
    .map(event => event.params.delta).join('');
  check('workflowReturnsToolUrl', Boolean(receipt && outputText.includes(receipt.result.dashboardUrl)));
  const override = await turn([textInput('Reply only OVERRIDE. Do not use tools.')], { model: selectedModel ?? started.model, effort: 'low' });
  const observed = await client.request('thread/resume', { threadId });
  report.overrideObserved = { model: observed.model, effort: observed.reasoningEffort ?? null };
  check('explicitModelEffortOverride', override.status === 'completed' &&
    observed.model === (selectedModel ?? started.model) && observed.reasoningEffort === 'low');
  let invalidModelRejected = false;
  try { const invalid = await turn([textInput('Reply only INVALID. Do not use tools.')], { model: 'shipyard-intentionally-invalid-model' });
    invalidModelRejected = invalid.status === 'failed';
  } catch (error) { invalidModelRejected = error.message.startsWith('RPC turn/start failed'); }
  check('invalidModelFailsWithoutFallback', invalidModelRejected);
  // Interrupt a real turn before it can finish; completing naturally does not count as interruption.
  const cursor = client.cursor();
  const interrupting = await client.request('turn/start', { threadId, model: selectedModel ?? started.model,
    input: [textInput('Write a long numbered list from 1 to 2000. Do not use tools.')] });
  // turn/start can return before inference becomes interruptible in this build.
  await client.waitFor(event => event.method === 'item/agentMessage/delta' &&
    event.params.turnId === interrupting.turn.id, cursor);
  report.interruptRpcAcknowledged = false;
  // An acknowledgement may race cancellation. Consume its error, but wait on the
  // authoritative terminal event rather than retrying or blocking on the RPC.
  client.request('turn/interrupt', { threadId, turnId: interrupting.turn.id }, 5000)
    .then(() => { report.interruptRpcAcknowledged = true; }, () => {});
  let interruptedStatus;
  try {
    const interrupted = await client.waitFor(event => event.method === 'turn/completed' &&
      event.params.turn.id === interrupting.turn.id, cursor, 5000);
    interruptedStatus = interrupted.params.turn.status;
    report.interruptCompletionSource = 'turn/completed';
  } catch {
    const stored = await client.request('thread/read', { threadId, includeTurns: true });
    interruptedStatus = stored.thread.turns?.find(item => item.id === interrupting.turn.id)?.status;
    report.interruptCompletionSource = 'thread/read';
    report.limitations.push('Interrupt completion notification was absent within 5 seconds; queried the stored matching turn instead.');
  }
  check('interrupt', interruptedStatus === 'interrupted');
  if (!diagnostic) {
    let protectedWriteDenied = false;
    try { accessSync(process.platform === 'darwin' ? '/var/root' : '/root', constants.W_OK); }
    catch (error) { protectedWriteDenied = ['EACCES', 'EPERM'].includes(error.code); }
    check('protectedLocationWriteDenied', protectedWriteDenied);
    const approval = await turn([textInput('Run node -e "process.stdout.write(\'SHIPYARD_APPROVAL_PROOF\')" once as the approval probe. Do not access files or use any other commands.')], { model: selectedModel ?? started.model });
    check('automaticToolApprovalObserved', approval.status === 'completed' &&
      (report.automaticApprovals['item/commandExecution/requestApproval'] ?? 0) > 0 &&
      commandProbeSucceeded(client.events, approval.cursor));
  } else {
    report.limitations.push('Non-admin OS permission and live command/file approval proof not run in diagnostic mode.');
  }
  report.limitations.push('create_run is a disposable MCP mock, not a deployed service. General MCP elicitation, broader permission requests, OAuth refresh and attestation are unsupported by this proof client.');
} catch (error) {
  // Error text is deliberately constrained: upstream messages can contain user paths/data.
  report.error = error.message.startsWith('RPC ') || error.message.startsWith('Timed out') ? error.message : 'Proof failed; inspect locally without publishing raw diagnostics.';
} finally {
  if (client) report.notificationMethods = [...new Set(client.events.map(event => event.method))].sort();
  if (client) await client.close();
  report.status = report.error || Object.values(report.checks).includes('fail') ? 'failed' : diagnostic ? 'diagnostic-only' : 'passed';
  writeFileSync(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'failed') process.exitCode = 1;
}
