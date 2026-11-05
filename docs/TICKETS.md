# Shipyard V1 Implementation Tickets

Status: proposed backlog derived from [PRODUCT_SPEC.md](PRODUCT_SPEC.md) and [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md). Ticket criteria require owner signoff before implementation. Creating a ticket does not establish that its acceptance scenarios have passed.

## Delivery rules

- Follow dependencies; independent tickets may proceed when their prerequisites are complete.
- Preserve the owner's product choices. Record engineering decisions left open by the spec in the relevant ticket's implementation evidence.
- Each implementation PR must show its approved criteria, changed behavior, relevant checks and platform evidence, and unresolved limitations. Environment failures are cannot-verify, not passes.
- Preserve non-admin execution, target-local authentication, owner-only service access, and user-controlled merges throughout the backlog.
- Use the acceptance scenario IDs A01–A16 from the implementation spec. Their mapping below is a coverage plan, not completed verification.

## Ticket index

The GitHub issues below mirror the ticket definitions in this file. Dependencies use stable SHIP identifiers; each issue also links its prerequisites.

| Ticket | Outcome | Dependencies |
| --- | --- | --- |
| [SHIP-001](https://github.com/Beluwuge/Shipyard/issues/2) | Prove the Codex app-server and workflow entry point | none |
| [SHIP-002](https://github.com/Beluwuge/Shipyard/issues/3) | Prove Tailnet identity and unattended supervision on Linux and macOS | none |
| [SHIP-003](https://github.com/Beluwuge/Shipyard/issues/4) | Establish the monorepo, versioned protocol and transactional run store | SHIP-001, SHIP-002 |
| [SHIP-004](https://github.com/Beluwuge/Shipyard/issues/5) | Deliver the owner-authenticated dashboard and run API shell | SHIP-002, SHIP-003 |
| [SHIP-005](https://github.com/Beluwuge/Shipyard/issues/6) | Set up and validate a target host over SSH | SHIP-002, SHIP-003, SHIP-004 |
| [SHIP-006](https://github.com/Beluwuge/Shipyard/issues/7) | Implement the durable target supervisor and launch registry | SHIP-002, SHIP-003 |
| [SHIP-007](https://github.com/Beluwuge/Shipyard/issues/8) | Approve criteria and prepare an isolated run workspace | SHIP-003, SHIP-004, SHIP-005, SHIP-006 |
| [SHIP-008](https://github.com/Beluwuge/Shipyard/issues/9) | Run one real Codex ticket over SSH with live controls | SHIP-001, SHIP-004, SHIP-005, SHIP-006, SHIP-007 |
| [SHIP-009](https://github.com/Beluwuge/Shipyard/issues/10) | Enroll workers and carry commands over an outbound connection | SHIP-004, SHIP-005, SHIP-006, SHIP-008 |
| [SHIP-010](https://github.com/Beluwuge/Shipyard/issues/11) | Reconcile transport fallback without duplicate execution | SHIP-008, SHIP-009 |
| [SHIP-011](https://github.com/Beluwuge/Shipyard/issues/12) | Enforce current-diff gates and bounded repair cycles | SHIP-007, SHIP-008 |
| [SHIP-012](https://github.com/Beluwuge/Shipyard/issues/13) | Commit evidence and publish a ready-for-review PR exactly once | SHIP-010, SHIP-011 |
| [SHIP-013](https://github.com/Beluwuge/Shipyard/issues/14) | Bootstrap and query service-managed project/global wikis | SHIP-003, SHIP-004, SHIP-007 |
| [SHIP-014](https://github.com/Beluwuge/Shipyard/issues/15) | Maintain wikis from verified outcomes and surface conflicts | SHIP-012, SHIP-013 |
| [SHIP-015](https://github.com/Beluwuge/Shipyard/issues/16) | Implement run-owned cleanup and retention controls | SHIP-012, SHIP-013 |
| [SHIP-016](https://github.com/Beluwuge/Shipyard/issues/17) | Deliver authenticated worker updates with rollback | SHIP-005, SHIP-009, SHIP-010 |
| [SHIP-017](https://github.com/Beluwuge/Shipyard/issues/18) | Back up and restore consistent service state | SHIP-003, SHIP-010, SHIP-013, SHIP-014 |
| [SHIP-018](https://github.com/Beluwuge/Shipyard/issues/19) | Verify V1 across both target platforms and publish operating guidance | SHIP-010, SHIP-012, SHIP-014, SHIP-015, SHIP-016, SHIP-017 |

## SHIP-001 — Prove the Codex app-server and workflow entry point

Dependencies: none. Spec: sections 8 and 13. Coverage: prerequisite for A03, A06, A09, A12.

Outcome: establish a supported, pinned Codex integration before the product depends on it.

Scope: create a small reproducible integration harness and decision record for app-server lifecycle, target-local login, approval handling, model defaults/overrides, and explicit $workflow installation/invocation. Use a disposable repository and non-admin account.

Acceptance criteria:

- Pin the tested Codex version and protocol schema; document initialize, thread creation/resume, events, input and interruption using observed behavior.
- Demonstrate a real turn with target-local credentials; persist its thread ID and resume the same conversation after app-server restart without exporting authentication material.
- Demonstrate automatic tool approval behavior within OS permissions; criteria approval remains a separate owner decision. Report unsupported approval types explicitly.
- Install and invoke $workflow so it can collect run inputs and return a dashboard link through a minimal Shipyard tool contract.
- Record target-default model/effort behavior and explicit override failure behavior. Unsupported required capabilities produce a concrete alternative and its product impact.

Evidence: exact versions, sanitized protocol fixtures, reproducible commands and outcomes. Record remaining integration decisions; this is a bounded proof rather than production implementation.

## SHIP-002 — Prove Tailnet identity and unattended supervision on Linux and macOS

Dependencies: none. Spec: sections 3 and 13. Coverage: prerequisites for A01, A02, A06.

Outcome: establish deployable owner authentication and target process persistence on both operating systems.

Scope: exercise Tailscale Serve with a loopback service and proposed systemd-user/LaunchAgent supervision under a dedicated non-admin account.

Acceptance criteria:

- Demonstrate owner identity, another identity, and absent identity at Serve; record the behavior of tagged devices separately from user traffic.
- Show that the backend cannot be reached directly over LAN/Tailnet and that supplied client identity headers do not authenticate a requester.
- Demonstrate process survival after SSH disconnect, account logout, supervisor restart and machine reboot on each OS, recording prerequisites and unavailable capabilities honestly.
- Document owner-required account provisioning, Linux lingering/macOS login availability, installation directories and rollback/uninstall steps without granting the service sudo.
- Select the supported supervision/install strategy and document the verified platform matrix.

Evidence: sanitized identity responses, listener checks, process identity observations and Linux/macOS persistence results.

## SHIP-003 — Establish the monorepo, versioned protocol and transactional run store

Dependencies: SHIP-001, SHIP-002. Spec: sections 2, 4, 5 and 7. Coverage: A03, A04, A07 foundations.

Outcome: the control service can persist and reload validated host/project/run records with enforceable transitions.

Scope: choose and pin runtimes, package boundaries and operational storage; implement schemas, migrations, command/event envelopes and a minimal service lifecycle. Resolve the proposed SQLite choice in a decision record.

Acceptance criteria:

- A fresh checkout can install, build and start the minimal service using documented commands and pinned dependencies.
- Versioned records cover host, project, run, criteria revision/approval, gates, events, publication and retention; restart preserves stored state.
- Validate phase transitions and optimistic revisions; stale commands return conflicts without changing state.
- Enforce unique request/command keys and producer-event sequences so replay does not duplicate records.
- Reserve a host slot transactionally and keep connectivity separate from execution phase; heartbeat expiry cannot release an active slot.

Evidence: migration/restart results, transition and concurrent-admission checks, reproducible developer setup, and chosen runtime/storage rationale.

## SHIP-004 — Deliver the owner-authenticated dashboard and run API shell

Dependencies: SHIP-002, SHIP-003. Spec: sections 3 and 7. Coverage: A01.

Outcome: the owner can open a Tailnet-only dashboard and inspect persisted run records.

Scope: loopback API behind Serve, locally bootstrapped owner configuration, basic dashboard navigation/run listing, mutation authorization and replayable event delivery.

Acceptance criteria:

- Accept only the configured owner's verified proxy identity; reject different/missing identities and direct header spoofing.
- State-changing browser requests enforce origin and CSRF checks; machine connections cannot impersonate the owner through browser headers.
- List/read runs with phase, connectivity, criteria revision and last confirmed status; errors have useful next actions.
- Reconnect event delivery using a cursor without duplicating events; expired cursors return an explicit snapshot boundary.
- Document deployment with Serve and no public Funnel or direct network API listener.

Evidence: owner/unauthorized/CSRF scenarios and dashboard inspection against a real Serve setup.

## SHIP-005 — Set up and validate a target host over SSH

Dependencies: SHIP-002, SHIP-003, SHIP-004. Spec: sections 3 and 7. Coverage: A02.

Outcome: the owner can register a target and see exactly whether it is ready for unattended runs.

Scope: host setup UI/API, verified SSH connection, prerequisite/authentication checks, account-owned installation and initial root/preferred-mode settings.

Acceptance criteria:

- Persist hostname, non-admin account, dedicated credential reference, verified host key, roots and preferred connection mode.
- Reject changed SSH host keys and report unsupported/admin accounts, elevation configuration, missing binaries, unwritable directories and unavailable unattended persistence.
- Guide the owner through target-local Codex and gh authentication; verify repository access without centralizing tokens.
- Install the supervisor/worker package through SSH into account-owned storage using validated payloads and fixed executable invocation; user strings cannot become shell code.
- Readiness reflects the preferred mode's actual capability; show worker mode as pending until enrollment is implemented and verified.

Evidence: one Linux and one macOS setup, failed-prerequisite matrix, malicious path/payload cases and sanitized credential handling.

## SHIP-006 — Implement the durable target supervisor and launch registry

Dependencies: SHIP-002, SHIP-003. Spec: sections 4–6 and 11. Coverage: A04, A05, A07, A12 foundations.

Outcome: every target has one authoritative process registry regardless of transport.

Scope: detached supervision, durable launch records, target host locking, process-tree ownership, generation fencing, local event spool and idempotent launch/status/stop commands.

Acceptance criteria:

- Persist a run/nonce registration before launch acknowledgement. Repeating the same launch returns the existing process; conflicting launch ownership is rejected.
- Enforce one active host slot locally as well as in the control service; concurrent invocations cannot start duplicate run processes.
- Recover registry state after restart using process identity and start metadata; PID reuse and stale supervisor generations cannot adopt or terminate an unrelated process.
- Spool metadata events durably until acknowledged and replay them with stable sequence numbers.
- Stop the owned process tree idempotently and confirm termination before releasing the target lock; uncertain state remains reconciling.

Evidence: local crash/race/acknowledgement-loss scenarios with counted processes, persistent records and cancellation results on both OSes.

## SHIP-007 — Approve criteria and prepare an isolated run workspace

Dependencies: SHIP-003, SHIP-004, SHIP-005, SHIP-006. Spec: sections 4, 5 and 9. Coverage: A03, A04, A08.

Outcome: the owner can approve a ticket and obtain a prepared branch containing its exact criteria before implementation starts.

Scope: draft criteria editing/approval, atomic host admission, managed clones or existing repositories, worktree/default-origin branch preparation, and explicit direct-checkout mode.

Acceptance criteria:

- Approval binds owner/time to an immutable criteria hash and revision. Editing criteria invalidates approval and pauses dependent work.
- Duplicate create/admit requests return the same run; concurrent admissions on one host reserve one slot while separate hosts can prepare independently.
- Fetch origin, resolve the default branch to a SHA, and create a unique branch/worktree in a configured starting root. Repository URLs and paths are validated.
- Commit the exact approved criteria snapshot after preparing the workspace and before any implementation command.
- Reject dirty/conflicting direct checkouts without stashing, resetting, cleaning or committing user changes; offer isolated worktree mode instead.

Evidence: criteria/hash checks, admission races, managed/existing repository cases and unchanged user-file snapshots in rejected checkout scenarios.

## SHIP-008 — Run one real Codex ticket over SSH with live controls

Dependencies: SHIP-001, SHIP-004, SHIP-005, SHIP-006, SHIP-007. Spec: sections 5, 7 and 8. Coverage: A03, A06, A12.

Outcome: $workflow can launch an approved target run and the owner can follow and steer it in the dashboard.

Scope: production Codex adapter, SSH command adapter using the supervisor, real thread persistence, message/event relay and pause/resume/cancel controls. Publication is deferred to SHIP-012.

Acceptance criteria:

- Launch one app-server conversation through the authoritative supervisor in the prepared workspace; persist thread/process identity and target model defaults or explicit override.
- Show phase, last confirmed connectivity, displayable messages and control outcomes without depending on hidden reasoning or archiving raw tool output centrally.
- Browser or SSH disconnect does not close supervisor-owned app-server stdio. Reconnect resumes tracking the existing thread/process.
- Persist steering-message IDs and reconcile delivery acknowledgement loss; uncertain delivery is visible and never blindly retransmits a turn that may already have started.
- Criteria changes pause further implementation; cancellation remains pending until target process-tree termination is confirmed and partial work is recoverable.

Evidence: a real small coding task, disconnect/reconnect trace, steering delivery-loss case, pause/resume and cancellation evidence on Linux/macOS.

## SHIP-009 — Enroll workers and carry commands over an outbound connection

Dependencies: SHIP-004, SHIP-005, SHIP-006, SHIP-008. Spec: sections 2, 3 and 7. Coverage: A02, A05, A06 foundations.

Outcome: a target can connect back to the service and execute the same supervisor contract without an inbound worker listener.

Scope: SSH-established per-host credentials, authenticated outbound TLS channel, version negotiation, command acknowledgements and event replay.

Acceptance criteria:

- Enroll through verified SSH and bind a credential to one host identity; reject revoked/unknown credentials and cross-host command use.
- Authenticate worker traffic separately from dashboard identity headers and exclude secrets from normal responses/logs.
- Carry the same validated launch/status/control envelopes used by SSH into the same registry; no alternate Codex launcher is introduced.
- Reconnect and replay commands/events idempotently; incompatible protocol versions report a recoverable readiness failure.
- Host setup can exercise and record both modes, and the owner can choose the preferred mode.

Evidence: Linux/macOS enrollment, invalid/revoked credential cases, channel drops and protocol compatibility results.

## SHIP-010 — Reconcile transport fallback without duplicate execution

Dependencies: SHIP-008, SHIP-009. Spec: sections 4–6. Coverage: A04, A05, A06, A07, A12.

Outcome: automatic SSH/worker fallback recovers access while preserving exactly one active target execution for a run.

Scope: preferred-mode selection, launch uncertainty handling, shared registry reconciliation, service restart recovery and explicit operator fencing workflow.

Acceptance criteria:

- Fall back before launch only after authoritative status proves the run was not launched; reuse the run ID and launch nonce.
- Lost launch acknowledgements, stale generations and unreachable registries enter reconciliation rather than starting another process.
- After confirmed launch, another transport attaches to the existing run/thread; it does not create an independent attempt.
- Service restart and simultaneous adapter requests preserve the host slot. Expired heartbeats cannot authorize another run.
- Unreachable cancellation stays pending; an operator recovery can release ownership only after the old supervisor is fenced.

Evidence: fault-injection matrix covering both direction switches, acknowledgement loss, process crash/restart, PID reuse, stale generation and simultaneous adapters; count active processes and thread IDs.

## SHIP-011 — Enforce current-diff gates and bounded repair cycles

Dependencies: SHIP-007, SHIP-008. Spec: sections 5 and 9. Coverage: A09, A10 foundations.

Outcome: only the settled, verified change can become eligible for publication.

Scope: explicit project gate configuration, local/branch CI execution and discovery, Codex review findings, optional risk-based assurance contracts, evidence invalidation and repair counters.

Acceptance criteria:

- Store gate version, checked SHA/diff digest, criterion IDs, status and evidence; preserve project Definition of Done separately from ticket criteria.
- Distinguish absent CI, unreadable required-check policy, failed checks and cannot-verify environment failures. Only configured, satisfied requirements pass.
- Run Codex review of the current diff with actionable findings; record when design/security/fresh-judge assurance is required and whether its evidence is available.
- Changed code invalidates affected checks/reviews. Allow initial verification plus three repair cycles; exhaustion pauses without weakening failed gates.
- Required PR-only CI without a configured equivalent blocks pre-publication with an actionable explanation; do not silently open a draft PR.

Evidence: passing/failing/stale evidence fixtures, missing versus unreadable CI policy, unavailable judge/environment cases and exact repair-counter boundary results.

## SHIP-012 — Commit evidence and publish a ready-for-review PR exactly once

Dependencies: SHIP-010, SHIP-011. Spec: sections 4, 5 and 9. Coverage: A09, A10, A11.

Outcome: an eligible run publishes a reviewable GitHub PR using the owner's target-local git/gh identity.

Scope: final artifact commit, final-head gate reconciliation, push, PR creation/reconciliation, publication status and cancellation race handling.

Acceptance criteria:

- Commit final evidence before settling the final publication SHA and rerun checks invalidated by that commit; avoid embedding a commit's own hash in its content.
- Push using git/gh on the target account and verify the branch still matches the checked head; external edits stop publication rather than trigger force-push.
- Inspect for an existing run-branch PR before creation; lost create responses reconcile to one ready-for-review PR and stored URL/number.
- Repositories without CI can publish after Codex review with a clear no-CI note; unresolved required PR-only checks remain blocked.
- Record a PR already created before late cancellation honestly. Never schedule automatic merge; failed/cancelled unpublished runs do not create a PR.

Evidence: a real disposable GitHub repository with configured/no-CI/PR-only cases, lost-response recovery, external-edit conflict and cancellation-race results.

## SHIP-013 — Bootstrap and query service-managed project/global wikis

Dependencies: SHIP-003, SHIP-004, SHIP-007. Spec: section 10. Coverage: A13, A14 foundations.

Outcome: each project has a versioned knowledge namespace independent of its code PRs, plus a small owner-preference namespace.

Scope: service-owned Git storage, immutable explicit source captures, wiki schema/index/log, guidance/docs ingestion, scoped text retrieval and dashboard memory inspection.

Acceptance criteria:

- Initialize project/global namespaces outside target repositories; source captures carry ID/hash, origin commit/path or URL, time and scope.
- Bootstrap from selected repository documentation at a recorded commit; ingestion cannot change global policy by treating source AGENTS.md text as service instructions.
- Produce source-linked pages, index and operation log with automatic Git commits and inspect/revert capability.
- Queries stay in requested scope and return cited relevant pages; pin the supplied wiki commit in run context rather than silently refreshing active runs.
- Never capture credentials or every file Codex happens to read. Central logs exclude unfiltered tool output and outside-file contents.

Evidence: two-project isolation fixtures, hostile source-instruction case, explicit-source eligibility results and Git history/revert demonstration.

## SHIP-014 — Maintain wikis from verified outcomes and surface conflicts

Dependencies: SHIP-012, SHIP-013. Spec: section 10. Coverage: A13, A14.

Outcome: completed runs improve durable memory with traceable, reversible updates.

Scope: post-run memory work queue, Codex synthesis, serialized wiki writes, provenance/conflict validation, lint and retryable maintenance status.

Acceptance criteria:

- Successful completed runs enqueue one idempotent memory update using verified evidence; failed/partial runs do not become verified knowledge automatically.
- Update existing canonical pages before creating duplicates; preserve source references, supersession/conflict status, index and chronological log.
- Conflicting claims remain visible for review; global preferences require an explicit owner statement rather than inference from project choices.
- Serialize competing writes and commit each valid update; expose failed maintenance for retry without revoking a valid published PR.
- Lint broken links, missing sources, duplicate pages, stale claims and conflicts; runs retain their pinned memory revision.

Evidence: conflicting/superseding sources, duplicate update delivery, concurrent writers, invalid citations, maintenance failure/retry and unchanged active-run context.

## SHIP-015 — Implement run-owned cleanup and retention controls

Dependencies: SHIP-012, SHIP-013. Spec: sections 9 and 10. Coverage: A12, A14, A15.

Outcome: completed/recoverable runs free resources according to policy without deleting user-owned work.

Scope: 30-day log/recovery retention, early deletion/keep overrides, partial-file snapshots, worktree cleanup and PR/remote-branch lifecycle reconciliation.

Acceptance criteria:

- Retain failed/cancelled/unmerged branches and partial files in a recoverable snapshot for 30 days unless kept longer; early deletion has explicit ownership checks.
- After publication remove only the run-owned clean worktree when required content is committed/pushed; never remove direct checkouts or unrelated directories.
- After merge delete the run-owned remote branch only if it still matches the recorded head; preserve newer external changes.
- Expire logs after 30 days and honor earlier owner deletion; expose keep-until and cleanup failures in the dashboard.
- Document separate lifetimes for criteria/evidence commits, wiki state, sources and backups; explicit memory deletion enumerates derived state and backup expiry.

Evidence: controlled-clock retention cases, recovery from partial snapshots, changed-branch protection and unrelated-file/checkout preservation checks.

## SHIP-016 — Deliver authenticated worker updates with rollback

Dependencies: SHIP-005, SHIP-009, SHIP-010. Spec: section 11. Coverage: A16 update behavior.

Outcome: security patches can install automatically while major updates remain owner-approved and active runs survive.

Scope: trusted release metadata, artifact verification, compatibility checks, staged atomic activation and prior-version recovery.

Acceptance criteria:

- Verify release metadata and artifact integrity before installation; reject untrusted/corrupt releases.
- Automatically accept trusted security-patch classifications; major or unknown classifications require an explicit owner decision.
- Stage during active runs and activate only after execution stops; preserve registry/state compatibility and do not terminate a run to update.
- Failed activation restores a compatible prior binary and usable supervisor state; incompatible schema transitions are blocked or have a verified recovery path.
- Show installed/pending versions, approval status and actionable failures in host controls.

Evidence: trusted/tampered metadata, major/unknown approval, active-run deferral and failed-install rollback on Linux/macOS.

## SHIP-017 — Back up and restore consistent service state

Dependencies: SHIP-003, SHIP-010, SHIP-013, SHIP-014. Spec: sections 4, 6, 10 and 11. Coverage: A16 recovery behavior.

Outcome: the owner can restore the control service without losing durable knowledge or accidentally relaunching active target jobs.

Scope: consistent operational-store snapshots, configuration and wiki Git backups, destination/scheduling configuration and a documented restore procedure.

Acceptance criteria:

- Snapshot operational state, configuration and matching wiki repositories consistently; exclude target authentication stores and report incomplete backups.
- Support a configured daily schedule and destination after the proposed backup policy is resolved in the implementation decision record.
- Restore into a clean service installation with validated schema/version checks and retained wiki history.
- Reconcile restored run/host state against authoritative target registries before accepting new launches; stale backup locks cannot imply that current target processes are absent.
- Document credential references that need re-provisioning and source/derived-data deletion behavior for retained backups.

Evidence: full restore rehearsal with an active remote run, stale snapshot, unavailable destination and corrupted/incompatible backup cases.

## SHIP-018 — Verify V1 across both target platforms and publish operating guidance

Dependencies: SHIP-010, SHIP-012, SHIP-014, SHIP-015, SHIP-016, SHIP-017. Spec: sections 11–13. Coverage: A01–A16 final matrix.

Outcome: a reproducible V1 release candidate has direct evidence for all promised behavior.

Scope: complete $workflow-to-PR walkthrough, Linux/macOS target matrix, failure/recovery dashboard review, installation/operations/recovery documentation and acceptance evidence index.

Acceptance criteria:

- Complete a real owner-approved ticket from invocation through isolated implementation, gates, ready PR and cleanup on Linux and macOS, using both transport preferences.
- Demonstrate one run per host and parallel runs on separate hosts; execute transport/restart/cancellation uncertainty scenarios without duplicate work.
- Map every A01–A16 scenario to current evidence and report failures/unavailable environments explicitly; mocked-only results do not establish platform compatibility.
- Verify dashboard recovery instructions for authentication, host readiness, uncertain launch/cancel, failed gates, retries, publication, memory, updates and cleanup.
- Publish documented prerequisites, owner configuration, supported versions, limits, backup restore and update rollback; require owner review for any proposed scope change.

Evidence: versioned acceptance matrix and reproducible walkthrough recordings/log metadata with secrets and outside-file contents excluded. Release approval remains a separate owner decision.
