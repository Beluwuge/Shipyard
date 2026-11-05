# Shipyard

Shipyard is a self-hosted control service for running Codex coding workflows on remote Linux and macOS machines.

The dashboard runs on an always-on machine in your Tailscale network. Codex owns the workflow decisions; Shipyard manages hosts, run state, and GitHub delivery.

## Product status

This repository is starting with the agreed product specification. Implementation choices that depend on current Codex APIs and cross-platform host supervision remain open for validation.

See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) for the V1 scope, operating model, security boundaries, run lifecycle, Git behavior, and memory design.

See [docs/IMPLEMENTATION_SPEC.md](docs/IMPLEMENTATION_SPEC.md) for proposed component contracts, state transitions, duplicate prevention, acceptance scenarios, and delivery slices.

See [docs/TICKETS.md](docs/TICKETS.md) for dependency-ordered implementation tickets, proposed acceptance criteria, evidence requirements, and GitHub issue links.

## Codex integration proof

SHIP-001 adds a dependency-free app-server client, pinned Codex 0.148.0 request schemas, a disposable Shipyard MCP mock, and a packaged workflow skill. Run `npm test` for protocol/contract checks. See [the proof runbook and decision record](docs/SHIP-001-PROOF.md) before running live diagnostics or the non-admin execution proof.

The local-first execution proof uses `npm run proof:codex -- --local --model gpt-5.6-sol` with a read-only sandbox and a literal command allowlist. Its 14 passing checks are recorded separately from the deferred dedicated non-admin deployment proof.
