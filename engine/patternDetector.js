/**
 * Workflow pattern engine: sliding window, sequence grouping, repeat detection.
 * Collapses known flows (copy+paste, copy+tab_switch+paste) into single steps first.
 */

import { collapseActionsIntoFlows, isFlow } from './flowPatterns.js';

const WINDOW_MS = 60 * 60 * 1000; // 60 minutes
const MIN_REPEAT_COUNT = 3;

/**
 * Canonical key for an action. Flows use type-only so they group across domains
 * (e.g. "copy then paste" on Gmail and Notion counts as the same pattern).
 */
function actionKey(action) {
  if (isFlow(action)) {
    return `flow\t${(action.type || 'unknown').toLowerCase()}`;
  }
  const d = (action.domain || '').toLowerCase();
  const p = (action.normalizedPath || '/').toLowerCase();
  const t = action.type || 'unknown';
  return `${d}\t${p}\t${t}`;
}

/**
 * Compute a sequence signature: ordered list of action keys.
 * @param {Object[]} actions
 * @returns {string}
 */
function sequenceSignature(actions) {
  return actions.map(actionKey).join(' → ');
}

/**
 * Simple similarity: same length and key-by-key equality (already normalized).
 * @param {Object[]} a
 * @param {Object[]} b
 * @returns {boolean}
 */
function sequencesMatch(a, b) {
  if (a.length !== b.length) return false;
  return a.every((ax, i) => actionKey(ax) === actionKey(b[i]));
}

/**
 * Group consecutive actions into overlapping fixed-size windows, then by signature.
 * @param {Object[]} actions - Sorted by timestamp
 * @param {number} minLength - Min steps in a sequence (1 = single action repeated)
 * @param {number} maxLength - Max steps to consider (e.g. 8)
 * @returns {Map<string, { count: number, steps: Object[], timestamps: number[] }>}
 */
function findRepeatedSequences(actions, minLength = 1, maxLength = 8) {
  const bySignature = new Map();

  for (let len = minLength; len <= maxLength; len++) {
    for (let i = 0; i <= actions.length - len; i++) {
      const slice = actions.slice(i, i + len);
      const sig = sequenceSignature(slice);
      const existing = bySignature.get(sig);
      const timestamps = slice.map((a) => a.timestamp);

      if (existing) {
        // Count every occurrence of this sequence (overlapping windows still count as one run per distinct slice position for len=2)
        existing.count += 1;
        existing.timestamps.push(...timestamps);
        existing.steps = slice;
      } else {
        bySignature.set(sig, {
          count: 1,
          steps: slice,
          timestamps,
        });
      }
    }
  }

  return bySignature;
}

/**
 * Estimate time spent for a workflow (sum of gaps between consecutive step timestamps).
 * @param {number[]} timestamps - Sorted
 * @returns {number} - Milliseconds
 */
function estimatedTimeSpent(timestamps) {
  if (timestamps.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap > 0 && gap < 600000) total += gap; // cap single gap at 10 min
  }
  return total;
}

/**
 * Run pattern detection on actions in the last 60 minutes.
 * Returns workflows that repeat MIN_REPEAT_COUNT+ times, sorted by repeat count then time spent.
 * @param {Object[]} actions - From storage (with id, type, domain, normalizedPath, timestamp, metadata)
 * @param {number} windowMs - Sliding window (default 60 min)
 * @returns {Object[]} - { patternId, steps, repeatCount, estimatedTimeSpent }
 */
export function detectWorkflows(actions, windowMs = WINDOW_MS) {
  const cutoff = Date.now() - windowMs;
  const inWindow = actions
    .filter((a) => a && a.timestamp >= cutoff)
    .sort((a, b) => a.timestamp - b.timestamp);

  // Collapse copy+paste, copy+tab_switch+paste, click+copy into single flow steps
  const withFlows = collapseActionsIntoFlows(inWindow);

  const bySignature = findRepeatedSequences(withFlows);

  const workflows = [];
  for (const [sig, data] of bySignature.entries()) {
    const repeatCount = data.count;
    if (repeatCount < MIN_REPEAT_COUNT) continue;
    const patternId = `wf_${sig.slice(0, 50).replace(/\s+/g, '_')}_${repeatCount}`;
    workflows.push({
      patternId,
      steps: data.steps,
      repeatCount,
      estimatedTimeSpent: estimatedTimeSpent([...data.timestamps].sort((a, b) => a - b)),
    });
  }

  // Prefer copy-paste / flow workflows over click-only (so "Copy from X to Y" surfaces above "Repeated clicks")
  function isFlowWorkflow(w) {
    return w.steps.some((s) => isFlow(s));
  }
  function isClickOnlyWorkflow(w) {
    return w.steps.length > 0 && w.steps.every((s) => s.type === 'click');
  }
  workflows.sort((a, b) => {
    const aFlow = isFlowWorkflow(a);
    const bFlow = isFlowWorkflow(b);
    if (aFlow && !bFlow) return -1;
    if (!aFlow && bFlow) return 1;
    if (isClickOnlyWorkflow(a) && !isClickOnlyWorkflow(b)) return 1;
    if (!isClickOnlyWorkflow(a) && isClickOnlyWorkflow(b)) return -1;
    if (b.repeatCount !== a.repeatCount) return b.repeatCount - a.repeatCount;
    return b.estimatedTimeSpent - a.estimatedTimeSpent;
  });

  // Dedupe: keep one workflow per logical pattern
  const seen = new Map();
  const out = [];
  for (const w of workflows) {
    const sig = w.steps.map((s) => actionKey(s)).join('|');
    if (seen.has(sig)) continue;
    seen.set(sig, true);
    out.push(w);
  }
  return out;
}

/**
 * Domain-level clustering: group actions by domain for high-level stats.
 * @param {Object[]} actions
 * @returns {Map<string, number>} - domain -> count
 */
export function clusterByDomain(actions) {
  const map = new Map();
  for (const a of actions) {
    const d = (a.domain || '').toLowerCase() || 'unknown';
    map.set(d, (map.get(d) || 0) + 1);
  }
  return map;
}
