# Shipyard

Shipyard is a self-hosted control service for running Codex coding workflows on remote Linux and macOS machines.

The dashboard runs on an always-on machine in your Tailscale network. Codex owns the workflow decisions; Shipyard manages hosts, run state, and GitHub delivery.

## Product status

This repository is starting with the agreed product specification. Implementation choices that depend on current Codex APIs and cross-platform host supervision remain open for validation.

See [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) for the V1 scope, operating model, security boundaries, run lifecycle, Git behavior, and memory design.
