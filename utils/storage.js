/**
 * Local storage layer for activity logs.
 * All data stays in chrome.storage.local (privacy-first, no backend).
 */

export const STORAGE_KEY = 'workflow_intelligence_actions';
const MAX_ACTIONS = 5000;

/**
 * Append one or more actions to the log (trimmed by recency and count).
 * @param {chrome.storage.StorageArea} api - chrome.storage.local
 * @param {Object|Object[]} actions - Single action or array of actions
 */
export async function appendActions(api, actions) {
  const list = Array.isArray(actions) ? actions : [actions];
  const raw = await api.get(STORAGE_KEY);
  const existing = Array.isArray(raw[STORAGE_KEY]) ? raw[STORAGE_KEY] : [];
  const merged = [...existing, ...list];
  const trimmed = merged.slice(-MAX_ACTIONS);
  await api.set({ [STORAGE_KEY]: trimmed });
}

/**
 * Get actions within a sliding time window (milliseconds).
 * @param {chrome.storage.StorageArea} api
 * @param {number} windowMs - e.g. 60 * 60 * 1000 for 60 minutes
 * @returns {Promise<Object[]>}
 */
export async function getActionsInWindow(api, windowMs) {
  const raw = await api.get(STORAGE_KEY);
  const all = Array.isArray(raw[STORAGE_KEY]) ? raw[STORAGE_KEY] : [];
  const cutoff = Date.now() - windowMs;
  return all.filter((a) => a && typeof a.timestamp === 'number' && a.timestamp >= cutoff);
}

/**
 * Get all stored actions (for debugging or export).
 * @param {chrome.storage.StorageArea} api
 * @returns {Promise<Object[]>}
 */
export async function getAllActions(api) {
  const raw = await api.get(STORAGE_KEY);
  return Array.isArray(raw[STORAGE_KEY]) ? raw[STORAGE_KEY] : [];
}

/**
 * Clear all stored activity (resets suggestions and workflow data).
 * @param {chrome.storage.StorageArea} api
 */
export async function clearActions(api) {
  await api.remove(STORAGE_KEY);
}
