/**
 * Dashboard (options) page: view all workflows, clear data.
 * Uses same engine as popup; shows full list and cross-tab note.
 */

import * as storage from '../utils/storage.js';
import { STORAGE_KEY } from '../utils/storage.js';
import { detectWorkflows } from '../engine/patternDetector.js';
import { generateAutomationSuggestion } from '../engine/suggestionEngine.js';
import { flowDisplayLabel, isFlow } from '../engine/flowPatterns.js';

const WINDOW_MS = 60 * 60 * 1000;

const el = {
  workflows: document.getElementById('workflows'),
  empty: document.getElementById('empty'),
  error: document.getElementById('error'),
  actionCount: document.getElementById('actionCount'),
  clearData: document.getElementById('clearData'),
  insightWorkflows: document.getElementById('insightWorkflows'),
  insightActions: document.getElementById('insightActions'),
  insightTime: document.getElementById('insightTime'),
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

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

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

function formatWorkflowSteps(steps) {
  if (!steps || !steps.length) return '';
  return steps.map((s, i) => `${i + 1}. ${stepLabel(s)}`).join('  →  ');
}

function renderAgents(agents) {
  if (!agents || !agents.length) return '';
  return `
    <div class="card-agents">
      <p class="card-agents-title">Suggested agents</p>
      <div class="agent-list">
        ${agents
          .map(
            (a) =>
              `<span class="agent-pill" data-category="${escapeHtml(a.category)}" title="${escapeHtml(a.description)}">
                <span class="agent-name">${escapeHtml(a.name)}</span>
                <span class="agent-category">${escapeHtml(a.category)}</span>
              </span>`
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderWorkflow(workflow) {
  const suggestion = generateAutomationSuggestion(workflow);
  const stepsText = formatWorkflowSteps(workflow.steps);
  const agentsHtml = renderAgents(suggestion.suggestedAgents);
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
    ${agentsHtml}
  `;
  return card;
}

function formatInsightTime(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.round(ms / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
}

async function load() {
  el.error.classList.add('hidden');
  try {
    const actions = await storage.getActionsInWindow(chrome.storage.local, WINDOW_MS);
    const workflows = detectWorkflows(actions, WINDOW_MS);

    if (el.actionCount) {
      el.actionCount.textContent = `${actions.length} actions in last 60 min`;
    }

    // Insights strip
    if (el.insightWorkflows) el.insightWorkflows.textContent = workflows.length;
    if (el.insightActions) el.insightActions.textContent = actions.length;
    if (el.insightTime) {
      const totalTime = workflows.reduce((sum, w) => sum + (w.estimatedTimeSpent || 0), 0);
      el.insightTime.textContent = workflows.length ? formatInsightTime(totalTime) : '—';
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

if (el.clearData) {
  el.clearData.addEventListener('click', clearAndReload);
}

// Auto-reload when activity is logged (storage changes)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[STORAGE_KEY]) load();
});

load();
