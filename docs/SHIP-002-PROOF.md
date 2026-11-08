# SHIP-002: Tailnet identity and supervision proof

Status: implementation and bounded platform diagnostics, **not complete acceptance**. The owner requested implementation of ticket 2 on 2026-11-09. Its criteria are preserved below; an environment limitation never counts as a pass. This proof is separate from the production dashboard, worker and durable run registry.

## Approved scope and evidence requirements

The implementation follows [SHIP-002](https://github.com/Beluwuge/Shipyard/issues/3): exercise Serve owner/different/absent identities and tagged traffic; prevent direct LAN/Tailnet header impersonation; exercise disconnect, logout, service restart and reboot on Linux/macOS; document non-admin provisioning, installation and removal; choose a supervision strategy from observed capabilities. Implementing this ticket authorizes disposable fixtures, not changing account privileges, rebooting an active machine or logging its owner out.

## Implementation

`packages/host-proof/server.mjs` provides a read-only `/identity` endpoint bound explicitly to IPv4 loopback. It compares one exact `Tailscale-User-Login` header with the locally configured owner. Missing, duplicate and different identities fail closed. Responses contain process/instance metadata and an authorization decision; they do not echo the login, request headers or paths. Other paths return 404 and non-GET methods return 405. This is a proof endpoint, not a production authenticated API; CSRF and browser mutations belong to SHIP-004.

`probe.mjs` installs a uniquely named disposable systemd user unit or macOS LaunchAgent. It persists removal handles before activation, installs a durable copy of the proof server, and supports status, restart, crash recovery and removal. It refuses root and flags known administrative/root-equivalent groups, including docker. `--allow-privileged` explicitly permits diagnostic execution under such an account without claiming non-admin verification. A clean group screen still does not audit sudoers, polkit, ACLs, writable system services or other elevation paths. Runtime compatibility is reported separately; the Linux Node 18 run is diagnostic evidence only, below the repository's Node >=22 requirement.

`check-identity.mjs` sends normal and forged identity requests through an existing HTTPS Serve endpoint, with certificate validation enabled. It checks that decision and process instance remain the same and probes direct backend access. Its default expectation is the owner; use `SHIPYARD_PROOF_EXPECT=different-identity` or `missing-or-ambiguous-identity` for real non-owner or tagged clients. A connection error alone is not proof of a correct listener: inspect sockets on the target too.

## Trust boundary and decision

Keep the backend bound to `127.0.0.1`, expose it only through Tailnet Serve, and never enable Funnel for it. The local owner login configuration is authoritative; membership in the Tailnet is insufficient. Serve removes caller-provided identity headers and supplies the identity of the authenticated user; tagged devices lack those user headers and must use a separate machine authentication path. See [Tailscale identity headers](https://tailscale.com/docs/features/tailscale-serve#identity-headers).

**Loopback trusts the local host.** A local process can connect directly and forge proxy headers. This is a known boundary of the specified loopback/Serve design, also described by Tailscale; these fixtures do not claim resistance to local users, root, or arbitrary code already running as the service account. LAN/Tailnet clients cannot reach the backend socket directly. If hostile local accounts are in scope, a stronger proxy/backend boundary must be designed before production; simply checking the source address or forwarding headers does not solve that problem.

Select **systemd user services with lingering on Linux** for unattended deployment, conditional on a dedicated non-admin account and actual reboot/logout evidence. Lingering starts a user manager at boot and keeps it after logout; enabling it is an owner provisioning step. See [loginctl](https://www.freedesktop.org/software/systemd/man/255/loginctl.html).

Select **LaunchAgents for logged-in macOS sessions only**. They can launch automatically at login and restart failed processes, but they do not meet continuous operation after account logout or before login after reboot. See [Apple's user service model](https://developer.apple.com/documentation/servicemanagement?language=swift). Do not mark macOS unattended-ready. Full macOS boot/logout operation needs a separately reviewed owner-installed LaunchDaemon running with a dedicated non-admin `UserName`, or an explicitly accepted requirement change. This ticket does not install a root daemon or grant service sudo.

## Reproduction

Use Node >=22 for supported execution. Commands below run on the target under its service account. Keep state files and owner configuration private; do not commit their contents. The harness installs only its fixed proof executable, never Codex jobs.

```sh
export SHIPYARD_PROOF_OWNER='your-exact-tailnet-login'
npm run proof:host -- setup .shipyard-proof/host-state.json
npm run proof:host -- status .shipyard-proof/host-state.json
npm run proof:host -- restart .shipyard-proof/host-state.json
npm run proof:host -- crash .shipyard-proof/host-state.json
```

For a diagnostic under an existing elevated non-root account, append `--allow-privileged` to setup. This never upgrades its evidence to non-admin proof. `SHIPYARD_PROOF_PORT` defaults to 47831 and must be an unprivileged port. Save the setup instance ID; disconnect SSH completely, reconnect separately, and compare the status instance ID. This proves SSH transport independence, not that all sessions have logged out. A restart/crash must produce a new instance ID.

Inspect `tailscale serve status --json` before changes. Choose an unused HTTPS port, record its exact route, and configure only that listener. Never use `serve reset` on a machine with existing routes. Tailnet ACLs and HTTPS provisioning must allow access. Serve setup may require an owner/admin to configure the route or delegate the Tailscale operator role; the proof does not invoke sudo to bypass denial. Example for an owner-provisioned isolated listener:

```sh
tailscale serve --bg --https=9443 http://127.0.0.1:47831
```

From another device, using its real Tailscale identity:

```sh
export SHIPYARD_PROOF_OWNER='your-exact-tailnet-login'
node packages/host-proof/check-identity.mjs \
  https://target.your-tailnet.ts.net:9443/identity \
  http://target-tailnet-ip:47831/identity
```

Repeat with an actual second user and tagged device. Merely sending different headers from the owner's device is a spoofing test, not a second-user test. An absent header on a direct loopback request is a policy fixture, not evidence of missing identity at Serve. Confirm `lsof -nP -iTCP:47831 -sTCP:LISTEN` on macOS or `ss -ltn sport = :47831` on Linux shows only `127.0.0.1`, and probe LAN/Tailnet addresses from another device. Do not add IPv6/wildcard listeners.

For a coordinated full-logout/reboot test, retain the private state file, ensure the executable and state directory persist, record the platform boot ID, and after owner-authorized reboot observe enabled-unit startup before an interactive login. On Linux record `loginctl show-user ACCOUNT -p Linger` and all remaining sessions. Do not count closing one SSH connection as a full logout. On macOS the LaunchAgent's expected logout result is unavailable service, so a success claim would be incorrect. Do not reboot or terminate an active owner session merely to run this proof.

## Installation and rollback

- Linux payload/config: `~/.local/state/shipyard-proof/shipyard-proof-<random>/`; `systemctl --user enable --now` links its unique unit into the user's configuration. Owner provisions the non-admin account, Node >=22, Tailnet access and lingering. Neither service nor worker needs sudo.
- macOS payload/config: the same account-owned state directory; generated plist: `~/Library/LaunchAgents/shipyard-proof-<random>.plist`. A working `gui/<uid>` login domain is required. Install does not change login, auto-login, FileVault or system daemon settings.
- Local state file: chosen path, normally under ignored `.shipyard-proof/`; mode 0600. The owner login resides in the private installed config. Supervisor logs contain listener metadata only. The harness's process environment is inherited; use a clean account/session rather than assuming it filters unrelated secrets.

Remove only the Serve listener created for the proof, then unload and delete the proof service:

```sh
tailscale serve --https=9443 off
npm run proof:host -- cleanup .shipyard-proof/host-state.json
```

Cleanup disables/stops the exact Linux unit or boots out the exact LaunchAgent, removes its plist/unit and payload, and deletes its state file. It does not change other Serve routes, lingering, accounts, authentication stores or other services. If setup fails, retain the state file to retry cleanup. If the GUI login domain is absent, the agent is already unloaded; remove its exact plist and payload. Do not manually delete unrelated directories. Existing service versions are untouched, so rollback consists of removing the disposable fixture; production upgrades belong to SHIP-016.

## Observed platform matrix

Evidence: [platform results](evidence/SHIP-002-platforms.json), [actual local Serve requests](evidence/SHIP-002-serve-local.json). Tested on 2026-11-09 Singapore time. Public evidence excludes account login names, hostnames, target network addresses, credentials and filesystem paths.

| Check | Linux diagnostic | macOS diagnostic |
| --- | --- | --- |
| Runtime | Node 18.19.1; unsupported for Shipyard | Node 26.8.1 |
| Tailscale | 1.104.5 | 1.102.3 |
| OS | kernel 7.0.0-1019-nvidia, systemd 255 | macOS 26.6.2 |
| Dedicated non-admin | **Unavailable:** sudo/docker account | **Unavailable:** admin account |
| Loopback listener and missing-header denial | Observed | Observed |
| Direct Tailnet backend with supplied identity | Refused from Mac | Refused from Linux |
| LAN binding | No LAN/wildcard listener; cross-LAN probe unavailable | No LAN/wildcard listener; cross-LAN probe unavailable |
| SSH disconnect | Same instance after reconnect | Not tested over SSH; survives launching shell exit |
| Service restart / crash respawn | New instance observed for both | New instance observed for both |
| Full logout / user-manager restart / machine reboot | Not performed | Not performed; logout unsupported by LaunchAgent strategy |
| Lingering / login availability | Linger=yes; unit enabled | GUI login domain available; plist loaded |
| Real Serve owner/header stripping | Setup denied by Tailscale permissions | Observed on host's own Serve URL; cross-device request timed out |
| Real other user / tagged / absent at Serve | Unavailable | Unavailable |

The Mac proof uses only port 9443. A proposed test on port 443 was rejected by automatic approval review and remains pending owner approval; no 443 route was created. Linux existing Serve routes were inspected and preserved. No account privilege, operating-system package, lingering setting, or login policy was changed. No live reboot/logout or user-manager termination was attempted. **SHIP-002 remains open** until the missing identity and non-admin/persistence criteria have real evidence and the macOS strategy gap is resolved.
