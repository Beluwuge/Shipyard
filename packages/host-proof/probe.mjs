import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile, rm, lstat, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { inspectAccount, supervisorDefinition } from './platform.mjs';

const [action, stateArgument, ...flags] = process.argv.slice(2);
const stateFile = path.resolve(stateArgument || '.shipyard-proof/host-state.json');
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const readState = async () => JSON.parse(await readFile(stateFile, 'utf8'));
const saveState = async state => {
  await mkdir(path.dirname(stateFile), { recursive: true, mode: 0o700 });
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
};
function service(state, operation) {
  if (state.platform === 'linux') return run('systemctl', ['--user', operation, `${state.name}.service`]);
  const target = `gui/${process.getuid()}/${state.name}`;
  if (operation === 'restart') return run('launchctl', ['kickstart', '-k', target]);
  if (operation === 'stop') return run('launchctl', ['bootout', target]);
  return run('launchctl', ['print', target]);
}
async function observe(state) {
  const response = await fetch(`http://127.0.0.1:${state.port}/identity`, { signal: AbortSignal.timeout(3000) });
  const body = await response.json();
  if (response.status !== 403 || body.proof !== 'SHIP-002' || body.name !== state.name) throw new Error('Unexpected proof listener');
  return { ...body, status: response.status };
}
async function waitFor(state, oldInstance) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try { const result = await observe(state); if (result.instance !== oldInstance) return result; } catch {}
    await pause(200);
  }
  throw new Error('Proof listener did not become ready');
}

try {
  if (action === 'setup') {
    try { await access(stateFile); throw new Error('State already exists; inspect or clean up first'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (flags.some(flag => flag !== '--allow-privileged')) throw new Error('Unknown setup flag');
    const account = inspectAccount();
    if (account.uid === 0) throw new Error('Root execution is not supported');
    if (!account.groupScreenPassed && !flags.includes('--allow-privileged')) throw new Error('Privileged account: use a dedicated non-admin account; diagnostic override is --allow-privileged');
    if (!['linux', 'darwin'].includes(process.platform)) throw new Error('Unsupported platform');
    const name = `shipyard-proof-${randomBytes(6).toString('hex')}`;
    const directory = path.join(homedir(), '.local', 'state', 'shipyard-proof', name);
    const port = Number(process.env.SHIPYARD_PROOF_PORT || '47831');
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid proof port');
    const owner = process.env.SHIPYARD_PROOF_OWNER;
    if (!owner || /[\s,]/u.test(owner)) throw new Error('Set SHIPYARD_PROOF_OWNER to the exact Tailnet login');
    const script = path.join(directory, 'server.mjs');
    const config = path.join(directory, 'config.json');
    const definition = supervisorDefinition({ platform: process.platform, name, node: process.execPath, script, config, directory });
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await copyFile(fileURLToPath(new URL('./server.mjs', import.meta.url)), script);
    await writeFile(config, JSON.stringify({ owner, port, name }), { mode: 0o600, flag: 'wx' });
    const unitFile = process.platform === 'linux' ? path.join(directory, `${name}.service`) : path.join(homedir(), 'Library', 'LaunchAgents', `${name}.plist`);
    await mkdir(path.dirname(unitFile), { recursive: true, mode: 0o700 });
    await writeFile(unitFile, definition, { mode: 0o600, flag: 'wx' });
    const state = { name, directory, port, platform: process.platform, unitFile, account, node: process.version,
      runtimeSupported: Number(process.versions.node.split('.')[0]) >= 22 };
    // Persist recovery handles before supervisor operations so failed setup can
    // always be inspected and uninstalled. No secrets are written here.
    await saveState(state);
    if (process.platform === 'linux') run('systemctl', ['--user', 'enable', '--now', unitFile]);
    else run('launchctl', ['bootstrap', `gui/${process.getuid()}`, unitFile]);
    console.log(JSON.stringify({ action, account, runtimeSupported: state.runtimeSupported, observation: await waitFor(state) }));
  } else if (['status', 'restart', 'crash', 'cleanup'].includes(action)) {
    const state = await readState();
    // A state file is an execution handle. Do not accept arbitrary service names
    // or recursive deletion paths, even if someone edits that file.
    const expectedDirectory = path.join(homedir(), '.local', 'state', 'shipyard-proof', state.name);
    const expectedUnit = state.platform === 'linux' ? path.join(expectedDirectory, `${state.name}.service`) : path.join(homedir(), 'Library', 'LaunchAgents', `${state.name}.plist`);
    if (!/^shipyard-proof-[a-f0-9]{12}$/u.test(state.name) || state.platform !== process.platform || state.directory !== expectedDirectory || state.unitFile !== expectedUnit) throw new Error('Invalid proof state');
    if ((await lstat(state.directory)).isSymbolicLink()) throw new Error('Symlinked proof directory');
    if (action === 'status') {
      service(state, 'status');
      console.log(JSON.stringify({ action, account: inspectAccount(), node: state.node, runtimeSupported: state.runtimeSupported,
        linger: process.platform === 'linux' ? run('loginctl', ['show-user', String(process.getuid()), '-p', 'Linger', '--value']) : 'not-applicable',
        observation: await observe(state) }));
    } else if (action === 'restart' || action === 'crash') {
      const before = await observe(state);
      if (action === 'restart') service(state, 'restart');
      else if (process.platform === 'linux') run('systemctl', ['--user', 'kill', '--signal=SIGKILL', '--kill-whom=main', `${state.name}.service`]);
      else run('launchctl', ['kill', 'SIGKILL', `gui/${process.getuid()}/${state.name}`]);
      const after = await waitFor(state, before.instance);
      console.log(JSON.stringify({ action, restarted: before.instance !== after.instance, before, after }));
    } else {
      if (process.platform === 'linux') {
        run('systemctl', ['--user', 'disable', '--now', `${state.name}.service`]);
      } else {
        try { service(state, 'stop'); } catch (error) {
          // A logged-out GUI domain has already unloaded its agents. Missing
          // target is safe; all other launchctl errors remain visible.
          if (!/Could not find service|No such process/u.test(String(error.stderr))) throw error;
        }
      }
      await rm(state.unitFile, { force: true });
      if (process.platform === 'linux') run('systemctl', ['--user', 'daemon-reload']);
      await rm(state.directory, { recursive: true });
      await rm(stateFile);
      console.log(JSON.stringify({ action, removed: true }));
    }
  } else throw new Error('Usage: probe.mjs setup|status|restart|crash|cleanup [state-file] [--allow-privileged]');
} catch (error) {
  // Supervisor stderr may contain account paths; keep raw errors local.
  console.error(error.message);
  process.exitCode = 1;
}
