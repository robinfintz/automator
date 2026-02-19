/**
 * Central event logger: actions only (no page visits).
 * Logs: tab_switch, click, copy, paste. (reload not available without webNavigation)
 */

import * as storage from '../utils/storage.js';
import { getDomain, getNormalizedPath, generateActionId } from '../utils/helpers.js';

const api = chrome.storage.local;

const VALID_ACTION_TYPES = ['click', 'copy', 'paste', 'tab_switch'];

function isLoggableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('chrome:') || url.startsWith('edge:') || url.startsWith('about:')) return false;
  return true;
}

/**
 * Build a normalized action object.
 * @param {string} type - "click" | "copy" | "paste" | "reload" | "tab_switch"
 * @param {string} url - Full URL
 * @param {Object} [metadata] - Optional extra
 */
function buildAction(type, url, metadata = {}) {
  return {
    id: generateActionId(),
    type,
    domain: getDomain(url),
    normalizedPath: getNormalizedPath(url),
    timestamp: Date.now(),
    metadata: Object.keys(metadata).length ? metadata : undefined,
  };
}

/**
 * Handle tab switch (user focused a different tab).
 */
async function onTabActivated(activeInfo) {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!isLoggableUrl(tab.url)) return;
    const action = buildAction('tab_switch', tab.url);
    storage.appendActions(api, action);
  } catch (_) {
    // Tab may have been closed
  }
}

/**
 * Handle messages from content script: click, copy, paste.
 */
function onMessage(message, _sender, sendResponse) {
  if (message?.source !== 'workflow_intelligence_content') return;
  const { type, url, metadata } = message;
  if (!url || !VALID_ACTION_TYPES.includes(type)) {
    sendResponse({ ok: false });
    return;
  }
  if (!isLoggableUrl(url)) {
    sendResponse({ ok: false });
    return;
  }
  const action = buildAction(type, url, metadata || {});
  storage.appendActions(api, action).then(() => sendResponse({ ok: true }));
  return true;
}

/**
 * Register listeners. Call once from service worker.
 */
export function init() {
  chrome.tabs.onActivated.addListener(onTabActivated);
  chrome.runtime.onMessage.addListener(onMessage);
}
