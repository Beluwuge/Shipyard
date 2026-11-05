---
name: workflow
description: Start a Shipyard ticket draft on a selected host and repository and return its dashboard link.
---

Collect a host ID, GitHub owner/repository, ticket description, and a request key for this draft. Ask for missing inputs. Reuse the request key when reconciling a retry.

Invoke the connected Shipyard create_run tool with those inputs and criteriaApproved set to false. Return the run ID and dashboard URL from the tool response. Creating a draft is not approval of its criteria and does not launch implementation.

If the tool is unavailable or returns an error, explain that the draft was not confirmed. Do not invent a run ID/link or substitute shell commands. The integration-proof server is a disposable mock, so describe its result as a proof draft when that server is in use.
