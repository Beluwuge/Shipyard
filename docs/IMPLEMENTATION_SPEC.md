# Shipyard V1 Implementation Specification

Status: proposed implementation contract, derived from the [agreed product requirements](PRODUCT_SPEC.md). Product decisions are authoritative; internal interfaces, storage choices, and delivery slices below are engineering proposals. No implementation is claimed. External documentation checked 2026-11-05.

## 1. Outcome and scope

An owner can invoke $workflow, choose a repository and Linux/macOS target, approve ticket criteria, and supervise Codex through a Tailnet-only dashboard. Codex implements and reviews changes on the target. Shipyard preserves execution state, runs mechanical gates, and publishes a ready-for-review GitHub PR. The owner merges it.

V1 supports a single owner, one active run per host, concurrent runs on different hosts, SSH and outbound worker connections, and service-managed project memory. Multi-ticket builds, discovery mode, external invitations, and a custom Codex sidebar are deferred.

## 2. Components and responsibility

| Component | Responsibility | Location |
| --- | --- | --- |
| Codex workflow skill | Gather ticket inputs, explain criteria, submit approved run request, return dashboard link | Owner's Codex environment |
| Dashboard | Host setup, run selection, criteria approval, progress, steering, pause/cancel/resume, recovery, memory inspection | Control service |
| Control service | Authenticate owner, persist state, enforce admission and gate rules, reconcile execution, coordinate transports and retention | Always-on Tailnet machine |
| Target supervisor | Own durable launch registry, host lock, process lifecycle, target event spool, workspace and Git operations | Dedicated non-admin target account |
| SSH adapter | Invoke the supervisor's fixed command interface over verified SSH | Service to target |
| Worker adapter | Carry supervisor commands and events over an authenticated outbound connection | Target to service |
| Codex adapter | Manage one app-server conversation per run; relay user input and workflow decisions | Target supervisor |
| Memory maintainer | Maintain project/global Markdown wikis from eligible evidence and commit updates | Service-managed storage, reasoning through Codex |

Both transports must reach the same supervisor and registry. SSH must not launch an independent raw Codex process that bypasses this registry. A detached supervisor survives SSH/session disconnection. The supervisor implements process and integrity rules; Codex chooses the workflow's substantive next step. The backend may reject an invalid transition or unmet gate without inventing an alternative AI plan.

Suggested monorepo boundaries: apps/dashboard, apps/control, apps/worker, packages/protocol, packages/codex-adapter, packages/workflow, and docs. Package names are proposals; runtime versions and packaging are pinned by slice 0.

## 3. Identity and setup

The dashboard/API listens on loopback behind Tailscale Serve. Compare the proxy-provided login to the configured owner; reject missing or different identities. Do not expose a direct network listener that accepts client-supplied identity headers. Serve provides identity headers for user traffic, but tagged devices do not receive them; workers therefore need separate machine credentials. [Tailscale Serve identity documentation](https://tailscale.com/docs/features/tailscale-serve#identity-headers)

State-changing browser requests require origin validation and CSRF protection. Configure owner identity locally during bootstrap. Tailnet membership alone does not grant dashboard access. Do not enable Funnel.

Host setup performs these steps:

1. Owner supplies Tailnet hostname, SSH username, dedicated key reference, preferred transport, and initial workspace roots.
2. Verify SSH host identity. Changed host keys stop setup until resolved; never silently disable host verification.
3. Verify the supplied account is non-admin, has no passwordless elevation, and can write the selected managed data/workspace directories. Account provisioning and privileged prerequisites are owner tasks; setup cannot bootstrap its own sudo access.
4. Check git, gh, Codex, supported OS, disk access, and runtime compatibility. Report each unmet prerequisite.
5. Owner completes Codex and gh authentication on the target as the run account. Verify identity and selected repository access without exporting tokens.
6. Install the supervisor/worker through SSH into account-owned storage and register a per-host machine credential. Store only credential references in normal API responses.
7. Exercise both transports, record capabilities, and mark the host ready only when the selected mode is usable.

Use systemd user services on Linux and a LaunchAgent on macOS as proposed supervisors. Setup must detect whether they actually survive logout/reboot: Linux lingering and macOS login/boot availability may need owner configuration. A host that cannot provide unattended persistence is not reported as ready for that capability.

Workspace roots are starting locations. The account can access other OS-permitted files. Tool requests are automatically approved under the owner's policy; this does not grant sudo. Human criteria approval, major-update approval, and merge decisions remain distinct workflow gates. Codex/gh credentials stay on the target.

Shipyard never schedules an automatic merge, and Codex's workflow contract forbids one. With broad shell access and the owner's gh identity, this is an application policy rather than an OS-enforced inability to merge; do not represent it as a stronger isolation guarantee.

## 4. Persistent records

Use a transactional store for control state. SQLite is the proposed V1 default; it is independent of the wiki memory substrate. Keep schema migrations versioned and back up a consistent database snapshot plus wiki Git repositories and configuration. Daily backups to an owner-configured destination are the proposed default; restore must be exercised before operational release. Do not copy target authentication stores into service backups.

| Record | Essential fields and invariants |
| --- | --- |
| Host | ID, OS, SSH credential reference/host key, preferred mode, roots, capabilities, worker identity/version, connectivity, active-run slot |
| Project | Stable ID, canonical GitHub owner/repo, per-host clone reference, remote base policy, gate definition, wiki namespace |
| Run | UUID, host/project, request key, criteria revision/hash, phase, connectivity, revision, branch/workspace mode, base SHA, current head SHA, retry count, Codex thread ID, timestamps |
| Criteria | Run, immutable revision, text, content hash, approving owner and time; edits create another revision |
| Gate result | Run, gate ID/version, checked SHA and relevant diff digest, criterion IDs, pass/fail/cannot-verify, evidence reference, timestamp |
| Event | Run ID, producer ID, monotonic producer sequence, type, metadata payload, time; unique producer/sequence prevents replay duplication |
| Target launch | Run ID, launch nonce, supervisor generation, process identity/start time, Codex thread ID, execution state; durable before launch acknowledgement |
| Publication | Run ID, branch, expected head SHA, pushed SHA, PR number/URL and state; retries reconcile before creating a PR |
| Retention | Object, retention category, deadline, keep-until override, deletion outcome |

Admission atomically reserves one host slot for a run. A stale heartbeat does not free the slot. Release it only after authoritative target confirmation that execution has stopped, or after explicit operator recovery that fences the former supervisor. A UI timeout is insufficient evidence.

Run updates use optimistic revisions; stale commands return a conflict and current state. Criteria approval is bound to its exact hash. Requests, commands, and publication actions carry idempotency keys.

## 5. Run lifecycle

Execution phase and connectivity are separate. Connectivity is connected, disconnected, or reconciling; a disconnected run can still be executing on the target.

| Phase | Entry/exit contract |
| --- | --- |
| draft | Ticket input exists; editing is allowed |
| awaiting_criteria | Display current criteria revision and wait for owner approval |
| preparing | Reserve host; fetch base; prepare branch/workspace; commit the approved criteria snapshot before code changes |
| launching | Persist target launch record and start or recover the one run process |
| implementing | Codex owns work and substantive workflow decisions |
| verifying | Run required checks and review against the settled change |
| repairing | Codex addresses findings; increment one repair cycle and return to verification |
| publishing | Commit evidence, validate final head, push, reconcile/create ready PR |
| pr_open | PR URL and published head recorded; execution stopped; eligible worktree cleanup |
| paused | Reason recorded, including retry limit, changed criteria, unavailable gate, or unresolved launch status |
| cancelling | Deliver idempotent cancellation and await process-stop confirmation |
| cancelled / failed | Stop confirmed; preserve recoverable files and branch; no new PR |

PR lifecycle (open/merged/closed-unmerged) is tracked independently after publication. A Codex turn completing is not proof that the ticket passed its gates. Any criteria edit pauses implementation and invalidates the approval until the new revision is approved.

Allow the initial verification plus at most three repair-and-verification cycles. Transport reconnection and rerunning a transient status query do not consume a repair cycle. Exhaustion pauses with current evidence; it does not accept failed checks.

Cancel reaches a terminal state only after the target confirms termination of the supervised process tree. If unreachable, show cancellation pending and retain the host slot. A resumed terminal run creates a new execution attempt only after proving the old process stopped; it preserves run history and does not reset counters implicitly.

## 6. Duplicate prevention and fallback

1. Service persists the admitted run and a stable launch nonce, then submits Launch(run ID, nonce, expected supervisor generation).
2. Supervisor atomically registers the request under the host lock, persists its state, and starts the process. Repeating the same run/nonce returns the existing record. A conflicting nonce is rejected.
3. Supervisor acknowledges launch with process identity and thread ID when available. Events are spooled until acknowledged by the service.
4. On delivery timeout, query Status(run ID) through either mode. An explicit not-launched response from the same authoritative registry permits resubmitting the same launch request through the other mode.
5. Unknown, unreachable, stale-generation, or partially launched states enter reconciliation. They never authorize a second launch. Reconnecting through another transport attaches to the existing run.
6. After service/supervisor restart, rebuild status from durable records and verified process identity. PID alone is insufficient because it can be reused. Fence old supervisor generations before taking ownership.

Transport selection may fall back automatically before confirmed launch, but loss of an acknowledgement is still an uncertain launch. No timeout-based implementation may interpret uncertainty as absence. Codex termination/restart resumes the saved conversation after process-stop confirmation; it does not promise to resume an interrupted shell command exactly where it stopped.

## 7. Proposed Shipyard API

These are internal Shipyard contracts, not Codex API names. Use versioned JSON command envelopes and schema validation. Browser clients can use REST plus replayable server-sent events; worker connections carry the same command/event schemas over an outbound TLS channel.

| Operation | Inputs | Result/behavior |
| --- | --- | --- |
| CreateRun | Request key, host/project, ticket, workspace mode, optional base/model/effort | Run ID, revision, dashboard URL; replay returns same run |
| ApproveCriteria | Run ID, expected revision, criteria hash | Immutable approval or conflict |
| ControlRun | Run ID, expected revision, command ID, pause/resume/cancel | Accepted command and reconciled state |
| SteerRun | Run ID, message ID, text | Queued input; deliver once to the existing conversation |
| ReadRun | Run ID | Current phase/connectivity, criteria, gates, retry count, publication and recovery status |
| ReadEvents | Run ID, last acknowledged cursor | Ordered replay; return a snapshot boundary if retained events expired |
| HostCommand | Host/run ID, command ID, generation, operation | Durable idempotent result; shared by SSH and worker adapters |
| MemoryQuery | Project scope, query, pinned wiki commit | Relevant pages and provenance, bounded to requested scope |

Do not interpolate user folder, repository, or ticket strings into shell command text. SSH invokes a fixed supervisor executable and sends a validated payload. Worker enrollment uses an SSH-established credential; the dashboard owner headers are not machine authentication.

## 8. Codex integration contract

Use the documented app-server stdio transport locally under the target supervisor. Initialize the connection, persist the created thread ID, and resume that ID after reconnection. Stream notifications and handle approval requests through a versioned adapter. Pin a compatible Codex build and capture its protocol schema in slice 0; do not expose an experimental TCP listener as a public API. [Official app-server documentation](https://learn.chatgpt.com/docs/app-server)

The supervisor owns the app-server stdin/stdout for its lifetime so SSH loss does not close them. Browser disconnection does not stop a turn. Codex may finish its current authorized work while offline; new externally controlled criteria changes and mechanical publication gates require reconciliation before continuing. Use the supported authentication mechanism of the pinned version, preserving the user's target-local login requirement.

The $workflow skill is an invocation surface packaged with the plugin. It collects inputs, invokes authenticated Shipyard tools, and links the dashboard. Prove installation and explicit invocation against the pinned Codex version before shipping. Skills use a SKILL.md instruction file and can accompany MCP tools. [Official skills documentation](https://developers.openai.com/plugins/concepts/skills)

Capture only displayable messages and operational metadata for the dashboard; do not depend on hidden model reasoning. Advertised model choices are checked against the target's configuration; failures are shown rather than silently substituting another model.

## 9. Repository, assurance, and publication

Fetch origin and resolve its default branch to a SHA before preparation. Default to a managed clone plus a run worktree and unique branch. Branch naming can follow a configured prefix; Shipyard's own repository uses yicheng/. Use git and gh as the authenticated target account.

Direct-checkout mode must reject a dirty working tree, a branch owned by another run, or an active worktree conflict and offer worktree mode. Never stash, reset, clean, or commit pre-existing user changes automatically. Build the workspace before committing criteria; this corrects the ordering shorthand in the product brief.

Load an explicit project gate definition with command arrays, expected results, required CI names, and evidence requirements. Do not guess that every arbitrary workflow is required. Mark discovery incomplete when required-check policy cannot be read. Missing CI and undiscoverable CI are different states.

Checks and Codex review refer to the current settled diff. Preserve project Definition of Done separately from ticket criteria. Proposed assurance design, drawn from the handoff: early risk-based design review; current-diff code/security review; a fresh judge when UX/accessibility/visual criteria require it; evidence, severity, locations, and next actions for findings. Environment failures and unavailable judgment produce cannot-verify, never pass. Fixes invalidate affected evidence.

Run local checks and configured branch CI before ready PR publication. Push the branch as needed to trigger branch workflows. Required PR-only checks cannot pass before a PR exists: use an explicitly configured equivalent pre-publication gate or pause and explain the incompatibility. Do not silently downgrade the gate or create a draft PR against the owner's chosen policy. Repositories genuinely without CI may proceed after Codex review with a no-CI note.

Commit final evidence before settling the final head SHA, then rerun checks/review invalidated by that commit. Evidence files can cite the code tree/diff digest and prior commits; record the final publication SHA in operational storage to avoid a self-referential evidence commit. No content changes are allowed after the publication gate without invalidating it.

Use gh to inspect an existing PR for the run branch before creation. If the create response is lost, reconcile that branch before retrying. Do not force-push over external edits. A PR opened before a late cancellation is reported honestly; it cannot be treated as if publication never happened. Never merge automatically.

## 10. Memory and information lifecycle

Store project namespaces and the global owner-preference namespace in a service-owned Git repository. Proposed layout: schema/AGENTS.md, projects/<project-id>/raw/, projects/<project-id>/wiki/index.md, wiki/log.md and topic pages, plus global/wiki/. Keep this outside target repositories and project PRs.

Each source has an immutable ID/content hash, origin URL or repository commit/path, capture time, and scope. Each derived page records its sources, update time, status and supersession/conflict references. Existing project guidance is source material; ingesting an AGENTS.md does not grant it authority to change global service policy or another project's instructions.

Bootstrap from selected repo guidance/docs at a recorded commit. After a successfully completed run, Codex proposes synthesized updates from verified evidence. The service serializes writes, checks source/scope references, commits the change, and logs the operation. Failed/partial runs remain operational records rather than automatically becoming verified knowledge. Contradictions remain visible until resolved. Global preference updates require an explicit owner statement, not inference from one project's code.

Use ingest/query/lint operations: update existing pages before adding duplicates; retrieve via index and text search first; lint links, missing sources, duplicates, stale claims and conflicts. Pin the memory commit supplied to each run. New memory revisions do not silently rewrite the context of an active run. A memory update failure is a retryable maintenance failure and does not revoke a valid PR.

This follows the source/wiki/schema pattern; it does not require LangChain or a vector database. [Karpathy LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), [AAIF overview](https://aaif.io/blog/karpathys-llm-wiki-as-agent-memory), [LangChain wiki memory](https://www.langchain.com/blog/wiki-memory)

Persist action/path metadata, not raw tool output, in run logs. Arbitrary shell output may contain outside-file contents, so do not archive unfiltered stdout or whole Codex transcripts centrally. Raw wiki sources are explicit eligible inputs, not automatic copies of every file Codex reads. Authentication material is never a wiki source. Keep the dashboard's stored event schema compatible with this restriction.

Run logs expire after 30 days or earlier owner deletion. Durable criteria/evidence commits and derived wiki knowledge have separate lifetimes. Deleting a log is not a promise to erase project artifacts, Git history, source caches or backups; explicit memory deletion must enumerate and remove affected derived state and define backup expiry.

After PR publication, confirm the worktree is clean and all required content is committed and pushed before removing only the run-owned worktree. Direct checkouts are never removed. After merge, delete the run's remote branch only if it still points to the recorded run head. Failed/cancelled/unmerged recovery material expires after 30 days unless kept longer; retain partial files in a recoverable snapshot until that deadline. Cleanup must verify ownership and must not delete unrelated workspaces, branches, or newer external changes.

## 11. Updates and failure recovery

Use authenticated release metadata, artifact integrity checks, version compatibility checks, and an atomic rollbackable installation. Automatically apply releases classified as security patches by trusted Shipyard release metadata; require explicit approval for major versions. Unknown classification requires approval. Stage updates during active runs and activate after execution stops; do not terminate a run merely to patch its worker. Preserve a compatible prior binary and registry schema for rollback.

Dashboard recovery views must expose auth expiry, prerequisite failures, unreachable hosts, uncertain launch/cancel state, failed gates, exhausted repairs, publication errors, memory-maintenance errors, and cleanup failures. Show a useful next action and last confirmed state. Never display a disconnected process as failed solely because a heartbeat expired.

## 12. Acceptance and verification plan

These are implementation acceptance scenarios, not tests already executed.

| ID | Scenario and required evidence |
| --- | --- |
| A01 | Owner can use the Tailnet dashboard; another identity, absent identity, direct header spoof, and cross-origin mutation are rejected |
| A02 | Setup validates Linux/macOS prerequisites, host key, non-admin account, target-local Codex/gh auth and repository access; unsupported persistence is reported |
| A03 | Editing criteria invalidates approval; implementation cannot begin before the exact approved revision is committed in its prepared workspace |
| A04 | Two admissions for one host yield one active slot; different hosts execute concurrently |
| A05 | Drop a launch acknowledgement and switch transports: one target process exists, the same run/thread is recovered, and events are deduplicated |
| A06 | Lose SSH, worker channel, browser and service process in turn: target execution survives where configured; recovery reconciles rather than duplicates |
| A07 | PID reuse, stale supervisor generation and unknown target state cannot release a host lock or authorize another launch |
| A08 | Default mode creates an isolated branch/worktree from fetched origin; dirty direct checkout is rejected without touching user files |
| A09 | Gate failures stay failures, changes invalidate evidence, three repair cycles exhaust into pause, and no-CI is distinct from unreadable CI policy |
| A10 | A required PR-only gate without an equivalent pauses before publication; an eligible no-CI repository publishes a ready PR with disclosure |
| A11 | Lost PR-create response is reconciled to one PR; external branch edits are preserved; merge remains owner-controlled |
| A12 | Cancellation waits for process-tree stop confirmation and retains partial changes; unreachability remains pending |
| A13 | Project memory is isolated, source-linked, versioned and revertible; conflicts are visible; global preferences require owner evidence |
| A14 | Outside-file content and credentials do not enter central logs/wiki through unfiltered tool output; 30-day retention and early deletion are exercised |
| A15 | Worktree/branch cleanup respects ownership, recorded head and keep-until settings; direct checkouts are preserved |
| A16 | Security update, major-update approval, active-run deferral, failed-install rollback and consistent backup restore are demonstrated |

Verification spans unit checks for contracts/transitions, fault-injection transport tests, a real single-ticket repository fixture, and an end-to-end Linux/macOS host matrix. Each delivery slice must attach direct evidence for its relevant acceptance IDs. Do not mark compatibility complete from mocked adapters alone.

## 13. Delivery slices

| Slice | Reviewable outcome | Exit evidence |
| --- | --- | --- |
| 0: integration proof | Pin Codex/runtime versions; prove local auth, stdio lifecycle/resume, approval handling, $workflow invocation, Serve identity, and unattended supervisor on both OSes | Record exact versions, protocol schemas and failures; settle proposed storage/runtime choices |
| 1: host and run record | Owner-authenticated dashboard/API, one SSH target, durable draft/criteria state, host admission, prepared worktree and committed approval | A01–A04 and A08 |
| 2: durable execution | Target registry/supervisor, one real Codex run, streaming, steering, cancellation and reconnect | A05–A07 and A12 over SSH |
| 3: worker/fallback | Outbound enrollment, shared command schema and registry, transport fallback without duplicate execution | A02 and A05–A07 on both OSes |
| 4: assurance and PR | Gate configuration, current-diff review, repair cycles, evidence commit, git/gh publication and reconciliation | A09–A11; one real ready PR, no auto-merge |
| 5: memory | Service-owned wiki bootstrap, scoped retrieval, evidence-based updates, Git history and conflict inspection | A13–A14 |
| 6: operations | Cleanup, 30-day retention, backups/restore, worker updates and deployment guide | A14–A16 and complete Linux/macOS matrix |

Slice 0 is a bounded prerequisite, not an open-ended research phase. An unsupported integration must produce a concrete alternative and impact on agreed behavior before code assumes it works. V1 is complete only when all acceptance scenarios have evidence; the documentation PR itself establishes no runtime guarantees.
