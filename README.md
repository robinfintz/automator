# Workflow Intelligence

Chrome extension: **data collection and pattern detection engine** for an AI-native automation layer. It is not the product itself — it is the wedge that observes repetitive browser workflows and surfaces automation opportunities.

## Architecture

```
/background     → Action logging (tab_switch, reload, + messages from content)
/content        → In-page actions: click, copy, paste
/engine         → Pattern detection + suggestion generation (mock AI)
/popup          → UI: top workflows, time spent, automation ideas
/utils          → Storage API, URL normalization, IDs
```

- **Logging** is centralized in `background/eventLogger.js`; all actions are normalized (domain, normalizedPath) before storage.
- **Storage** is `chrome.storage.local` only; no backend, no external APIs.
- **Pattern detection** (`engine/patternDetector.js`) uses a 60-minute sliding window, sequence grouping, and repeat counting (3+).
- **Suggestions** (`engine/suggestionEngine.js`) are a mock layer; replace with LLM calls when ready.

## How to Load in Chrome

1. Open Chrome and go to `chrome://extensions/`.
2. Turn **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Select the folder that contains this `manifest.json` (the `Automation` project root).
5. The extension icon appears in the toolbar; use it to open the popup.

No build step is required. If you change the background service worker, click the **Reload** button on the extension card.

## Data Model

Each stored action:

```json
{
  "id": "act_<timestamp>_<random>",
  "type": "click | copy | paste | reload | tab_switch",
  "domain": "example.com",
  "normalizedPath": "/in/*",
  "timestamp": 1234567890,
  "metadata": {}
}
```

Paths are normalized: numeric IDs, UUIDs, and long hex segments become `*`; query params are stripped. Example: `linkedin.com/in/123abc` → domain `linkedin.com`, normalizedPath `/in/*`.

## Developer Notes

### How This Evolves Into an AI-Native Automation System

The extension is the **observation layer**. Next steps:

- **Structured logs** become the input to a workflow representation (graphs, steps, conditions). That representation can be versioned and refined by user feedback.
- **Patterns** (repeated sequences, domain clustering) become **workflow candidates** that an AI agent can reason about: “This looks like research on LinkedIn → copy to Notion.”
- **Automation ideas** today are template-based; later they can be **generated or refined by an LLM** from the same structured workflow + optional user intent.
- A separate **orchestration service** (local or cloud) can consume “approved” workflows and execute them via browser automation (e.g. Playwright) or APIs, with the extension optionally triggering or monitoring runs.

### How This Could Integrate With LLMs

- **`suggestionEngine.js`** is the integration point. Replace `generateAutomationSuggestion(workflow)` with a call to your backend or a direct API call (with user consent and privacy controls).
- Send only **aggregated workflow descriptors** (patternId, step types, domains, repeat count, optional anonymized path patterns), not raw URLs or PII.
- LLM output can be structured (e.g. JSON: `title`, `description`, `automationIdea`, `suggestedSteps`) and optionally **user-editable** in the popup before “save” or “run.”
- For privacy-first deployments, run the LLM **locally** (e.g. Ollama, local model) so data never leaves the machine.

### How This Could Eventually Generate Playwright Scripts

- A **workflow** is already a sequence of typed actions (visit, click, copy, tab_switch) with domain and normalized path. That maps naturally to Playwright concepts: `page.goto()`, `page.click()`, `page.evaluate(() => navigator.clipboard…)`, context switching.
- A **codegen module** (separate from the extension) can take a workflow + optional selectors (e.g. from a future “click inspector”) and emit Playwright (or Puppeteer) script snippets.
- The extension’s role: **identify and export** the workflow; the **runner** (CLI or cloud) executes the generated script. That keeps the extension small and avoids executing arbitrary code in the browser.

### Why Local Logging Is Important for Privacy-First AI Systems

- **Trust**: Data never leaves the user’s machine unless they explicitly export or share it. That is critical for knowledge work (internal tools, confidential tabs).
- **Compliance**: Local-first avoids storing browsing behavior in third-party servers and simplifies GDPR/CCPA posture (data minimization, user control).
- **Optional cloud**: Users can opt in to “sync” or “improve suggestions” by sending only **anonymized, aggregated** patterns (e.g. “user has pattern: visit + copy on domain X”) to a service that improves shared automation templates — without sending URLs or timestamps.

---

**Constraints (MVP):** No backend, no external APIs, fully local. Code is modular, commented, and structured for production and future extension.
