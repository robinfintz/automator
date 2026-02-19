/**
 * Popup UI: loads actions from storage, runs pattern detection and suggestion engine,
 * renders top 3 workflows.
 */

import * as storage from '../utils/storage.js';
import { detectWorkflows } from '../engine/patternDetector.js';
import { generateAutomationSuggestion } from '../engine/suggestionEngine.js';
import { flowDisplayLabel, isFlow } from '../engine/flowPatterns.js';

const WINDOW_MS = 60 * 60 * 1000;
const TOP_N = 3;

const el = {
  workflows: document.getElementById('workflows'),
  empty: document.getElementById('empty'),
  error: document.getElementById('error'),
  actionCount: document.getElementById('actionCount'),
  openDashboard: document.getElementById('openDashboard'),
  clearData: document.getElementById('clearData'),
};

function showEmpty() {
  el.workflows.classList.add('hidden');
  el.error.classList.add('hidden');
  el.empty.classList.remove('hidden');
}

function showError(msg) {
  el.workflows.classList.add('hidden');
  el.empty.classList.add('hidden');
  el.error.classList.remove('hidden');
  el.error.textContent = msg;
}

function formatTime(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)} min`;
}

/** Human-readable step label for one action (or composite flow) */
function stepLabel(action) {
  if (isFlow(action)) {
    const label = flowDisplayLabel(action.type, action.steps, action);
    if (action.fromDomain && action.toDomain) return label;
    const where = (action.domain || '') + ((action.normalizedPath || '/').replace(/\/$/, '') || '');
    return where ? `${label} (${where})` : label;
  }
  const type = (action.type || '').toLowerCase();
  const domain = action.domain || '';
  const path = (action.normalizedPath || '/').replace(/\/$/, '') || '';
  const where = domain + (path !== '/' ? path : '');
  if (type === 'tab_switch') return `Switch to ${where}`;
  if (type === 'reload') return `Reload ${where}`;
  if (type === 'click') return `Click on ${where}`;
  if (type === 'copy') return `Copy on ${where}`;
  if (type === 'paste') return `Paste on ${where}`;
  return `${type} ${where}`;
}

/** Build workflow steps text for display */
function formatWorkflowSteps(steps) {
  if (!steps || !steps.length) return '';
  return steps.map((s, i) => `${i + 1}. ${stepLabel(s)}`).join('  →  ');
}

function renderWorkflow(workflow) {
  const suggestion = generateAutomationSuggestion(workflow);
  const stepsText = formatWorkflowSteps(workflow.steps);
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="card-title">${escapeHtml(suggestion.title)}</h2>
    <div class="card-meta">
      <span class="count">${workflow.repeatCount}×</span>
      <span class="time">${formatTime(workflow.estimatedTimeSpent)}</span>
    </div>
    ${stepsText ? `<p class="card-workflow">${escapeHtml(stepsText)}</p>` : ''}
    <p class="card-description">${escapeHtml(suggestion.description)}</p>
    <p class="card-idea">${escapeHtml(suggestion.automationIdea)}</p>
  `;
  return card;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function load() {
  el.error.classList.add('hidden');
  try {
    const actions = await storage.getActionsInWindow(chrome.storage.local, WINDOW_MS);
    const workflows = detectWorkflows(actions, WINDOW_MS).slice(0, TOP_N);

    // Show action count in empty state so user can confirm logging works
    if (el.actionCount) {
      el.actionCount.textContent = `${actions.length} actions in last 60 min`;
    }

    if (workflows.length === 0) {
      showEmpty();
      return;
    }

    el.empty.classList.add('hidden');
    el.workflows.classList.remove('hidden');
    el.workflows.innerHTML = '';
    workflows.forEach((wf) => el.workflows.appendChild(renderWorkflow(wf)));
  } catch (err) {
    showError(err.message || 'Something went wrong.');
  }
}

async function clearAndReload() {
  if (!el.clearData) return;
  el.clearData.disabled = true;
  try {
    await storage.clearActions(chrome.storage.local);
    await load();
  } finally {
    el.clearData.disabled = false;
  }
}

function initPopup() {
  load();
  if (el.openDashboard) {
    el.openDashboard.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
  if (el.clearData) {
    el.clearData.addEventListener('click', clearAndReload);
  }
}

initPopup();
