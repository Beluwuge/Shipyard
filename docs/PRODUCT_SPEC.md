# Shipyard Product Specification

## Status

Planning baseline, based on user decisions gathered through 2026-11-05. This document records product intent; it does not claim that the implementation exists.

The companion [implementation specification](IMPLEMENTATION_SPEC.md) translates these decisions into proposed contracts, acceptance scenarios, and delivery slices. It labels engineering proposals separately from agreed requirements.

## Product

Shipyard is a third-party, self-hosted service that lets one user run and supervise Codex coding workflows on selected remote machines. It pairs a separate web dashboard with a Codex workflow entry point. The service runs on an always-on machine in the user's Tailscale network.

Codex owns reasoning and workflow decisions. Shipyard stores operational run state, manages host connections, and exposes run controls through the dashboard. Each run uses a persistent Codex app-server conversation on the selected target machine. The dashboard is the primary run-control surface; do not assume a custom Codex desktop sidebar extension.

## V1 goals

- Set up target hosts running Linux or macOS.
- Select a GitHub repository and target host, then start one focused ticket workflow.
- Refine and approve acceptance criteria in Codex before implementation.
- Run Codex on the target machine and track progress from the dashboard.
- Resume tracking after a Codex disconnect or service restart without launching duplicate work.
- Commit changes to an isolated branch, run required gates, and open a ready-for-review PR.
- Preserve durable run artifacts and project knowledge.

## V1 boundaries

- One user identity: the service is limited to the owner's Tailscale identity. No external invites or users in V1.
- One run per host at a time; different hosts may run in parallel.
- Focused single-ticket workflow only. Multi-ticket build and discovery workflows can follow later.
- GitHub is the first hosting integration. Use git and the GitHub CLI (gh) for repository and PR operations.
- Linux and macOS targets.
- The user approves PR merges. Shipyard never merges automatically.

## Operating model

### Service and dashboard

- Run the backend on an always-on machine inside the owner's Tailnet.
- Serve the dashboard separately from Codex, restricted to the owner's Tailscale identity.
- Use Codex's native $workflow invocation to start a run.
- The backend manages durable run state and host connections; it does not decide workflow steps.
- Give each run its own persistent Codex app-server conversation on its chosen target.
- Use the target's configured Codex model and effort by default, with an optional per-run override in the dashboard.

### Host setup and connections

- Configure allowed workspace roots during host setup. These set the run's initial working location; they are not a hard filesystem sandbox.
- Use a dedicated, non-admin run account on each target.
- Give the service dedicated SSH credentials with only the access needed to manage that run account and worker.
- Install and update the Shipyard worker over SSH during host setup.
- Support SSH and worker connection modes. Each host has a configured preferred mode.
- Try the preferred mode first. Fall back to the other mode only while launch is unconfirmed.
- After launch confirmation, a connection failure must trigger a status check of the existing run before any retry through another mode.
- Major worker updates require user approval. Security patches install automatically.

### Authentication and permissions

- Codex authentication stays on the target machine under the run account.
- GitHub operations use the owner's GitHub identity via gh on the target machine.
- Host setup asks the owner to authenticate gh under the run account and verifies repository access.
- Auto-approve Codex action prompts, including requests outside the selected workspace root.
- The non-admin account is the privilege ceiling; it cannot grant elevated OS access.
- Because roots are starting locations rather than access boundaries, Codex may access any files the run account can read. Treat this as an explicit capability of the run account.

## Ticket workflow

1. User starts a focused ticket run from $workflow and selects a host, project/repository, and workspace mode.
2. Codex helps refine the acceptance criteria.
3. User approves the criteria. Save the approved revision and hash.
4. Create or use a managed repository checkout and prepare the run worktree and branch from the latest origin default branch.
5. Commit the approved criteria snapshot in that workspace before implementation begins.
6. Codex implements the ticket and runs checks.
7. Run repository-configured CI gates and Codex's review of the settled diff. Findings block PR creation until fixed or retry limit is reached.
8. Allow up to three fix-and-check cycles. After that, pause and report remaining failures.
9. If the repository has no CI configured, Codex review remains required; the PR may open with a clear note that CI is absent.
10. Commit final evidence after the run finishes, push the branch, and open a ready-for-review PR as soon as required gates pass.
11. User reviews and merges the PR.

Environment failures are not passes. If the run is cancelled or fails after changes begin, keep the branch and partial changes for recovery; do not open a PR.

## Run isolation and cleanup

- Keep a managed clone for each repository on a host.
- Default to one Git worktree and branch per run, based on the latest origin default branch. Allow direct use of an existing checkout when requested.
- After opening a PR, remove the worktree but keep the branch and PR.
- Delete the remote branch after the PR is merged.
- Keep recovery branches for failed, cancelled, or unmerged runs for 30 days; allow the owner to extend retention.
- On disconnect or reconnect, inspect the current run status before taking action. Never start a second process for a run that may already be active.

## Durable artifacts, logs, and memory

### Run records

- Keep live run state and events in the backend.
- Keep approved criteria and final evidence as durable project artifacts, committed on the run branch.
- Retain run logs for 30 days, with an option to delete sooner.
- Logs record file paths and actions but do not copy contents of files read outside the workspace into the run record.

### LLM wiki memory

- Store memory in service-managed storage, separate from target repositories and their PRs.
- Maintain one project wiki per repository and a small global wiki for stable owner preferences.
- Use a Git-backed Markdown wiki so memory changes can be inspected and reverted.
- Keep original source material immutable and separate from the derived wiki.
- Bootstrap a project wiki from repository guidance and documentation, including AGENTS.md, README, and architecture docs.
- After each completed run, update the project wiki from verified outcomes. Preserve source references and flag conflicts for review.
- Use an instruction/schema file to define wiki structure and maintenance rules.
- Treat the wiki as durable knowledge, not as the operational run database. Keep active run state and short-lived events in separate backend storage.

## Repository and delivery

- New public GitHub repository: Beluwuge/Shipyard.
- Use one monorepo for the Codex plugin/workflow entry point, dashboard, backend, and worker.
- Push implementation branches and open ready-for-review pull requests after required gates pass.

## Decisions still requiring implementation research

- Choose concrete Codex app-server API version and supported authentication flow for target-host processes.
- Define the supported plugin/skill packaging and installation flow for $workflow.
- Confirm the exact Tailscale identity assertion and dashboard authentication mechanism.
- Define a portable Linux/macOS strategy for supervising the backend and worker processes.
- Define operational database schema, migrations, backup format, and recovery procedure.
- Define exact CI/review checks and how to discover repository-required checks.
- Define host capability checks and SSH/worker fallback state transitions.
- Define wiki schema, source identifiers, conflict/supersession metadata, and lint routine.

## Non-goals for V1

- Custom Codex desktop sidebar UI.
- Multi-user access, external invites, or public service exposure.
- Automatic PR merge.
- Multi-ticket orchestration and discovery workflows.
- Replacing Codex as the reasoning and workflow decision-maker.
