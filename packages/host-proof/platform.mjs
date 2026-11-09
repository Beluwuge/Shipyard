import { execFileSync } from 'node:child_process';

export function accountAssessment(uid, groups) {
  const elevatedGroups = groups.filter(group => ['root', 'admin', 'sudo', 'wheel', 'docker', 'lxd', 'incus-admin', 'disk'].includes(group));
  return { uid, elevatedGroups, groupScreenPassed: uid !== 0 && elevatedGroups.length === 0,
    delegationAudit: 'unverified', nonAdminVerified: false };
}

export function inspectAccount() {
  const groups = execFileSync('id', ['-Gn'], { encoding: 'utf8' }).trim().split(/\s+/u);
  return accountAssessment(process.getuid(), groups);
}

function safePath(value) {
  // Restrict proof paths so neither systemd specifiers, shell syntax nor XML
  // interpolation can change the generated supervisor command.
  if (typeof value !== 'string' || !/^\/[A-Za-z0-9_@./ -]+$/u.test(value) || value.split('/').includes('..')) throw new Error('Unsafe absolute proof path');
  return value;
}
const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function supervisorDefinition({ platform, name, node, script, config, directory }) {
  if (!/^shipyard-proof-[a-f0-9]{12}$/u.test(name)) throw new Error('Invalid proof service name');
  [node, script, config, directory].forEach(safePath);
  if (platform === 'linux') return `[Unit]\nDescription=Disposable Shipyard supervision proof\n[Service]\nType=simple\nExecStart="${node}" "${script}" "${config}"\nRestart=on-failure\nRestartSec=1\nUMask=0077\nNoNewPrivileges=yes\n[Install]\nWantedBy=default.target\n`;
  if (platform === 'darwin') return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${name}</string>\n<key>ProgramArguments</key><array>${[node, script, config].map(v => `<string>${xml(v)}</string>`).join('')}</array>\n<key>RunAtLoad</key><true/>\n<key>KeepAlive</key><true/>\n<key>ThrottleInterval</key><integer>1</integer>\n<key>Umask</key><integer>63</integer>\n<key>StandardOutPath</key><string>${xml(directory)}/stdout.log</string>\n<key>StandardErrorPath</key><string>${xml(directory)}/stderr.log</string>\n</dict></plist>\n`;
  throw new Error('Unsupported platform');
}
