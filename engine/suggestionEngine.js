/**
 * Suggestion engine: turns a detected workflow into a human-readable automation idea.
 * Uses flow from/to domains and step types for accurate, descriptive names.
 */

/**
 * Generate a structured automation suggestion for a workflow.
 * @param {Object} workflow - { patternId, steps, repeatCount, estimatedTimeSpent }
 * @returns {{ title: string, description: string, automationIdea: string, suggestedAgents: Array<{ name: string, description: string, category: string }> }}
 */
export function generateAutomationSuggestion(workflow) {
  const { steps, repeatCount, estimatedTimeSpent } = workflow;
  const domains = [...new Set(steps.map((s) => s.domain).filter(Boolean))];
  const types = [...new Set(steps.map((s) => s.type))];

  const title = summarizeTitle(steps, repeatCount, domains);
  const description = summarizeDescription(steps, repeatCount, estimatedTimeSpent);
  const automationIdea = getAutomationIdea(domains, types, steps);
  const suggestedAgents = getSuggestedAgents(workflow, types, domains);

  return {
    title,
    description,
    automationIdea,
    suggestedAgents,
  };
}

/**
 * Suggested automation agents/tools for this workflow. Extensible for future LLM or rule updates.
 * @returns {Array<{ name: string, description: string, category: string }>}
 */
function getSuggestedAgents(workflow, types, domains) {
  const { from, to } = getFlowDomains(workflow.steps);
  const agents = [];

  const hasCopyPasteFlow =
    types.includes('flow_switch_copy_switch_paste') ||
    types.includes('flow_copy_switch_paste') ||
    types.includes('flow_copy_paste');
  const hasTabSwitch = types.includes('tab_switch');
  const hasClick = types.includes('click') || types.includes('flow_click_copy');

  if (hasCopyPasteFlow) {
    agents.push(
      { name: 'Browser extension', description: 'Clipboard sync or snippet manager', category: 'Extension' },
      { name: 'n8n / Zapier', description: 'Cross-app automation with clipboard triggers', category: 'No-code' },
      { name: 'Playwright', description: 'Script copy/paste and tab navigation', category: 'Code' }
    );
  }
  if (hasTabSwitch && !hasCopyPasteFlow) {
    agents.push(
      { name: 'Tab groups / Workspaces', description: 'Chrome tab groups or One Tab', category: 'Browser' },
      { name: 'Single dashboard', description: 'Embed both tools in one page', category: 'No-code' }
    );
  }
  if (hasClick) {
    agents.push(
      { name: 'Playwright / Puppeteer', description: 'DOM automation and scripting', category: 'Code' },
      { name: 'Browser extension', description: 'Content script + click/copy listeners', category: 'Extension' }
    );
  }
  if (agents.length === 0) {
    agents.push(
      { name: 'Playwright', description: 'Full browser automation', category: 'Code' },
      { name: 'Custom extension', description: 'Chrome extension with content scripts', category: 'Extension' }
    );
  }

  // Dedupe by name
  const seen = new Set();
  return agents.filter((a) => {
    if (seen.has(a.name)) return false;
    seen.add(a.name);
    return true;
  });
}

/** Get from/to domains from first flow step if it's a cross-tab flow */
function getFlowDomains(steps) {
  const first = steps && steps[0];
  if (!first || !first.steps) return { from: null, to: null };
  const sub = first.steps;
  const from = sub[0]?.domain;
  const to = sub[sub.length - 1]?.domain;
  return { from: from || first.fromDomain, to: to || first.toDomain };
}

function summarizeTitle(steps, repeatCount, domains) {
  if (steps.length === 0) return 'Repeated workflow';
  const primaryDomain = domains[0] || 'this site';
  const stepTypes = steps.map((s) => s.type);
  const { from, to } = getFlowDomains(steps);
  const hasFlowSwitchCopySwitchPaste = stepTypes.includes('flow_switch_copy_switch_paste');
  const hasFlowCopySwitchPaste = stepTypes.includes('flow_copy_switch_paste');
  const hasFlowCopyPaste = stepTypes.includes('flow_copy_paste');
  const hasFlowClickCopy = stepTypes.includes('flow_click_copy');
  const hasClick = stepTypes.includes('click');
  const hasCopy = stepTypes.includes('copy');
  const hasPaste = stepTypes.includes('paste');
  const hasReload = stepTypes.includes('reload');
  const hasTabSwitch = stepTypes.includes('tab_switch');

  // Cross-tab copy → paste (either order: copy then switch, or switch then copy)
  const hasCopyToOtherTab = hasFlowSwitchCopySwitchPaste || hasFlowCopySwitchPaste;
  if (hasCopyToOtherTab && from && to)
    return `Copy from ${from} → paste into ${to} (${repeatCount}×)`;
  if (hasCopyToOtherTab)
    return `Copy in one tab, paste in another (${repeatCount}×)`;

  if (hasFlowCopyPaste && from && to)
    return `Copy from ${from} → paste into ${to} (${repeatCount}×)`;
  if (hasFlowCopyPaste)
    return `Copy-paste on ${primaryDomain} (${repeatCount}×)`;

  if (hasFlowClickCopy)
    return `Click then copy on ${primaryDomain} (${repeatCount}×)`;

  if (hasTabSwitch && domains.length >= 2)
    return `Switch between ${domains[0]} ↔ ${domains[1]} (${repeatCount}×)`;
  if (hasTabSwitch)
    return `Tab switching on ${primaryDomain} (${repeatCount}×)`;

  if (hasReload) return `Reload ${primaryDomain} (${repeatCount}×)`;
  if (hasCopy && hasPaste) return `Copy and paste on ${primaryDomain} (${repeatCount}×)`;
  if (hasCopy) return `Copy on ${primaryDomain} (${repeatCount}×)`;
  if (hasPaste) return `Paste on ${primaryDomain} (${repeatCount}×)`;
  if (hasClick) return `Repeated clicks on ${primaryDomain} (${repeatCount}×)`;
  return `Repeated on ${primaryDomain} (${repeatCount}×)`;
}

function summarizeDescription(steps, repeatCount, estimatedTimeSpent) {
  const mins = Math.round(estimatedTimeSpent / 60000);
  const timeStr = mins > 0 ? ` ~${mins} min in the last hour.` : ' In the last hour.';
  return `This pattern repeated ${repeatCount} times.${timeStr}`;
}

function getAutomationIdea(domains, types, steps) {
  const domainList = domains.slice(0, 2).join(' and ');
  const { from, to } = getFlowDomains(steps);

  if (types.includes('flow_switch_copy_switch_paste') || types.includes('flow_copy_switch_paste'))
    return from && to
      ? `Automate moving content from ${from} to ${to} with a snippet tool or browser extension.`
      : `Automate copy-to-other-tab with a shared clipboard or snippet tool.`;
  if (types.includes('flow_copy_paste') || types.includes('copy') || types.includes('paste'))
    return from && to
      ? `Sync or paste from ${from} to ${to} automatically with a content script or integration.`
      : `Automate with a content script and clipboard API, or a shortcut for ${domainList}.`;
  if (types.includes('flow_click_copy'))
    return `Automate "click then copy" with a content script (DOM + clipboard) or macro.`;
  if (types.includes('tab_switch'))
    return `Use one dashboard or tab group to avoid switching between ${domainList}.`;
  if (types.includes('reload'))
    return `Use auto-refresh or a keyboard shortcut instead of manual reload.`;
  if (steps.some((s) => s.type === 'click'))
    return `Automate with a content script and DOM, or a Playwright script.`;
  return `Automate with a content script or browser automation.`;
}
