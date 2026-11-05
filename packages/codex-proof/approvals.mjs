export function proofApprovalHandler({ threadId, enabled = false, allowMockDraft = false, record = () => {} }) {
  return async request => {
    const params = request.params;
    if (allowMockDraft && request.method === 'mcpServer/elicitation/request' &&
        params?.threadId === threadId && params.serverName === 'shipyard' && params.mode === 'form' &&
        params.requestedSchema?.properties && Object.keys(params.requestedSchema.properties).length === 0) {
      let args = params._meta?.tool_params;
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = null; } }
      if (args?.hostId === 'proof-host' && args.project === 'example/disposable' && args.criteriaApproved === false) {
        record('mockDraftApproval');
        return { action: 'accept', content: {} };
      }
    }
    const supported = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'];
    if (!enabled || request.params?.threadId !== threadId || !supported.includes(request.method)) {
      record(`unsupported:${request.method}`);
      throw new Error('Approval outside proof contract');
    }
    const decisions = request.params.availableDecisions;
    if (decisions && !decisions.includes('accept')) throw new Error('Single-action acceptance unavailable');
    record(request.method);
    // Single action only. No session-wide approval or persistent execpolicy mutation.
    return { decision: 'accept' };
  };
}

export function commandProbeSucceeded(events, after) {
  return events.some(event => event.sequence > after && event.method === 'item/completed' &&
    event.params?.item?.type === 'commandExecution' && event.params.item.status === 'completed' &&
    event.params.item.exitCode === 0 && event.params.item.aggregatedOutput?.includes('SHIPYARD_APPROVAL_PROOF'));
}
