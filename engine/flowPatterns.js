/**
 * Composite flow patterns: combine consecutive actions into single logical steps.
 * Used for pattern detection and display (e.g. copy+paste, copy+tab_switch+paste).
 */

const MAX_GAP = 25; // max actions between required steps when allowing optional clicks

/**
 * Find next action with type in allowedTypes, starting at start.
 * @param {string[]} [skipTypes] - types to skip (e.g. ['click'] or ['click','tab_switch'])
 * @returns index or -1
 */
function findNext(actions, start, allowedTypes, maxSteps = MAX_GAP, skipTypes = ['click']) {
  for (let k = start; k < actions.length && k - start < maxSteps; k++) {
    const t = actions[k]?.type;
    if (allowedTypes.includes(t)) return k;
    if (!skipTypes.includes(t)) return -1;
  }
  return -1;
}

/**
 * Match tab_switch → [clicks] → copy → [clicks] → tab_switch → [clicks or tab_switches] → paste
 */
function matchSwitchCopySwitchPaste(actions, i) {
  const i0 = findNext(actions, i, ['tab_switch'], 6);
  if (i0 < 0) return null;
  const i1 = findNext(actions, i0 + 1, ['copy'], 10);
  if (i1 < 0) return null;
  const i2 = findNext(actions, i1 + 1, ['tab_switch'], 12);
  if (i2 < 0) return null;
  const i3 = findNext(actions, i2 + 1, ['paste'], 15, ['click', 'tab_switch']);
  if (i3 < 0) return null;
  return {
    flow: buildFlow('flow_switch_copy_switch_paste', [
      actions[i0],
      actions[i1],
      actions[i2],
      actions[i3],
    ]),
    consumed: i3 - i + 1,
  };
}

/**
 * Match copy → [clicks or tab_switches] → tab_switch → [clicks or tab_switches] → paste
 * (allows multiple tab switches between copy and paste, e.g. copy, switch, switch, paste)
 */
function matchCopySwitchPaste(actions, i) {
  const i0 = findNext(actions, i, ['copy'], 10); // allow more clicks before copy
  if (i0 < 0) return null;
  const i1 = findNext(actions, i0 + 1, ['tab_switch'], 12);
  if (i1 < 0) return null;
  // after first tab_switch, allow skipping more tab_switches and clicks until we see paste
  const i2 = findNext(actions, i1 + 1, ['paste'], 15, ['click', 'tab_switch']);
  if (i2 < 0) return null;
  return {
    flow: buildFlow('flow_copy_switch_paste', [actions[i0], actions[i1], actions[i2]]),
    consumed: i2 - i + 1,
  };
}

/**
 * Match and consume a flow from the action array starting at index i.
 * Returns { matched: true, flow, consumed } or { matched: false }.
 * Tries patterns that allow optional clicks first, then strict consecutive.
 */
function matchFlowAt(actions, i) {
  if (i >= actions.length) return { matched: false };

  const a = (j) => (i + j < actions.length ? actions[i + j].type : null);

  // tab_switch → [clicks] → copy → [clicks] → tab_switch → [clicks] → paste
  const r4 = matchSwitchCopySwitchPaste(actions, i);
  if (r4) return { matched: true, ...r4 };

  // copy → [clicks] → tab_switch → [clicks] → paste
  const r3 = matchCopySwitchPaste(actions, i);
  if (r3) return { matched: true, ...r3 };

  // Strict consecutive (no clicks in between)
  if (a(0) === 'tab_switch' && a(1) === 'copy' && a(2) === 'tab_switch' && a(3) === 'paste') {
    return {
      matched: true,
      flow: buildFlow('flow_switch_copy_switch_paste', actions.slice(i, i + 4)),
      consumed: 4,
    };
  }
  if (a(0) === 'copy' && a(1) === 'tab_switch' && a(2) === 'paste') {
    return {
      matched: true,
      flow: buildFlow('flow_copy_switch_paste', actions.slice(i, i + 3)),
      consumed: 3,
    };
  }
  if (a(0) === 'copy' && a(1) === 'paste') {
    return {
      matched: true,
      flow: buildFlow('flow_copy_paste', actions.slice(i, i + 2)),
      consumed: 2,
    };
  }
  if (a(0) === 'click' && a(1) === 'copy') {
    return {
      matched: true,
      flow: buildFlow('flow_click_copy', actions.slice(i, i + 2)),
      consumed: 2,
    };
  }

  return { matched: false };
}

function buildFlow(flowId, steps) {
  const first = steps[0];
  const last = steps[steps.length - 1];
  const flow = {
    id: first.id,
    type: flowId,
    flowId,
    steps,
    domain: first.domain,
    normalizedPath: first.normalizedPath,
    timestamp: first.timestamp,
    metadata: { stepCount: steps.length },
  };
  // Cross-tab flow: record source and destination domains for smarter naming
  if (flowId === 'flow_switch_copy_switch_paste' && steps.length >= 4) {
    flow.fromDomain = steps[1].domain; // copy
    flow.toDomain = steps[3].domain;   // paste
  }
  if (flowId === 'flow_copy_switch_paste' && first.domain !== last.domain) {
    flow.fromDomain = first.domain;
    flow.toDomain = last.domain;
  }
  if (flowId === 'flow_copy_paste' && first.domain !== last.domain) {
    flow.fromDomain = first.domain;
    flow.toDomain = last.domain;
  }
  return flow;
}

/**
 * Collapse consecutive actions into flow steps where they match known patterns.
 * Returns a new array: each item is either an original action or a flow (with type flow_*).
 */
export function collapseActionsIntoFlows(actions) {
  if (!actions || !actions.length) return [];
  const out = [];
  let i = 0;
  while (i < actions.length) {
    const result = matchFlowAt(actions, i);
    if (result.matched) {
      out.push(result.flow);
      i += result.consumed;
    } else {
      out.push(actions[i]);
      i += 1;
    }
  }
  return out;
}

/** Human-readable label for a flow (for UI). Pass the full action for from/to domains. */
export function flowDisplayLabel(flowType, steps = [], action = null) {
  const t = (flowType || '').toLowerCase();
  const from = action?.fromDomain;
  const to = action?.toDomain;
  if ((t === 'flow_switch_copy_switch_paste' || t === 'flow_copy_switch_paste') && from && to)
    return `Copy from ${from} → paste into ${to}`;
  if (t === 'flow_switch_copy_switch_paste' || t === 'flow_copy_switch_paste')
    return 'Copy in one tab → paste in another';
  if (t === 'flow_copy_paste' && from && to)
    return `Copy from ${from} → paste into ${to}`;
  if (t === 'flow_copy_paste') return 'Copy then paste';
  if (t === 'flow_click_copy') return 'Click then copy';
  return flowType || 'Flow';
}

/** Whether the action is a composite flow */
export function isFlow(action) {
  const t = action?.type;
  return t === 'flow_copy_paste' || t === 'flow_copy_switch_paste' || t === 'flow_switch_copy_switch_paste' || t === 'flow_click_copy';
}
