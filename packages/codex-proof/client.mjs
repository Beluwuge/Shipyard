import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

// Raw messages remain in memory; callers persist only explicit evidence fields.
export class AppServerClient {
  constructor({ command = 'codex', args = ['app-server', '--listen', 'stdio://'], cwd,
    timeoutMs = 30_000, onRequest = async () => { throw new Error('Unsupported server request'); } } = {}) {
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.events = [];
    this.waiters = new Set();
    this.nextId = 1;
    this.sequence = 0;
    this.closed = false;
    this.onRequest = onRequest;
    this.child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.resume(); // Never forward authentication/configuration diagnostics to artifacts.
    this.child.stdin.on('error', () => this.fail(new Error('App-server input closed')));
    this.child.on('error', () => this.fail(new Error('Cannot start app-server')));
    this.child.on('exit', () => this.fail(new Error('App-server exited')));
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      try { this.receive(JSON.parse(line)); }
      catch { this.fail(new Error('Invalid app-server JSON')); this.child.kill(); }
    });
  }

  fail(error) {
    this.closed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    for (const waiter of this.waiters) { clearTimeout(waiter.timer); waiter.reject(error); }
    this.waiters.clear();
  }

  send(message) {
    if (this.closed) throw new Error('App-server connection closed');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params = {}, timeoutMs = this.timeoutMs) {
    if (this.closed) return Promise.reject(new Error('App-server connection closed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out: ${method}; outcome unknown`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try { this.send({ id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  receive(message) {
    if (message.method && Object.hasOwn(message, 'id')) {
      Promise.resolve().then(() => this.onRequest(message)).then(result => {
        if (!this.closed) this.send({ id: message.id, result });
      }).catch(() => {
        if (!this.closed) this.send({ id: message.id, error: { code: -32601, message: 'Unsupported proof request' } });
      });
    } else if (Object.hasOwn(message, 'id')) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`RPC ${pending.method} failed (${message.error.code})`));
      else pending.resolve(message.result);
    } else if (message.method) {
      const event = { ...message, sequence: ++this.sequence };
      this.events.push(event);
      if (this.events.length > 2000) this.events.shift();
      for (const waiter of this.waiters) {
        if (event.sequence > waiter.after && waiter.predicate(event)) {
          clearTimeout(waiter.timer); this.waiters.delete(waiter); waiter.resolve(event);
        }
      }
    }
  }

  cursor() { return this.sequence; }

  waitFor(predicate, after = 0, timeoutMs = this.timeoutMs) {
    const found = this.events.find(event => event.sequence > after && predicate(event));
    if (found) return Promise.resolve(found);
    if (this.closed) return Promise.reject(new Error('App-server connection closed'));
    return new Promise((resolve, reject) => {
      const waiter = { predicate, after, resolve, reject };
      waiter.timer = setTimeout(() => {
        this.waiters.delete(waiter); reject(new Error('Timed out waiting for event; outcome unknown'));
      }, timeoutMs);
      this.waiters.add(waiter);
    });
  }

  async initialize() {
    const result = await this.request('initialize', {
      clientInfo: { name: 'shipyard-proof', title: 'Shipyard integration proof', version: '0.1.0' },
    });
    this.send({ method: 'initialized', params: {} });
    return result;
  }

  async close() {
    if (this.child.exitCode === null && this.child.signalCode === null) {
      const exited = new Promise(resolve => this.child.once('exit', resolve));
      this.child.kill('SIGTERM');
      const timer = setTimeout(() => this.child.kill('SIGKILL'), 2000);
      await exited;
      clearTimeout(timer);
    }
    this.lines.close();
    // Descendants may retain pipe descriptors after the app-server exits.
    this.child.stdin.destroy();
    this.child.stdout.destroy();
    this.child.stderr.destroy();
  }
}
