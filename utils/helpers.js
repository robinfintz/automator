/**
 * Shared helpers for URL normalization and ID generation.
 * Used by both background and content scripts (via copy or shared contract).
 */

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_ID_REGEX = /\b\d{2,}\b/g;
const HEX_SEGMENT_REGEX = /\b[0-9a-f]{20,}\b/gi;

/**
 * Extract domain from a full URL.
 * @param {string} url - Full URL
 * @returns {string} - Hostname (e.g. "linkedin.com")
 */
export function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Normalize path: strip query/hash, replace numeric IDs and UUIDs with *.
 * Example: /in/123abc → /in/*
 *          /page/550e8400-e29b-41d4-a716-446655440000 → /page/*
 * @param {string} url - Full URL
 * @returns {string} - Normalized path (e.g. "/in/*")
 */
export function getNormalizedPath(url) {
  try {
    const u = new URL(url);
    let path = u.pathname || '/';
    // Replace UUIDs
    path = path.replace(UUID_REGEX, '*');
    // Replace long hex segments (e.g. object IDs)
    path = path.replace(HEX_SEGMENT_REGEX, '*');
    // Replace numeric IDs (2+ digits)
    path = path.replace(NUMERIC_ID_REGEX, '*');
    // Collapse multiple * into one
    path = path.replace(/\*+/g, '*');
    return path || '/';
  } catch {
    return '/';
  }
}

/**
 * Generate a unique ID for an action (time-based + random suffix).
 * @returns {string}
 */
export function generateActionId() {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
