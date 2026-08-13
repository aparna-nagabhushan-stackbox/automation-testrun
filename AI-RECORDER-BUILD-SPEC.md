# AI Recorder — Build Spec

## Overview

This is a build specification for the AI Recorder feature as implemented in StackTest (2026-08-13). The AI Recorder extends the existing "AI Recorder" page in the StackTest dashboard (nav id `nav-automation-builder`, page id `page-automation-builder`) so that both of its recording modes (in-tab bookmarklet and Playwright-codegen "new window") also produce, via Claude, plain-English steps with confidence flags, a summary, cleaned code, and masked test data. Flows that don't match an existing block or have low-confidence locators land in a pending review queue for admin approval.

This document is a reference for the delivered feature, reconstructed from the implementation plan and shipped code. It is not an externally-authored source document, but an accurate record of what was built.

---

## Recording Modes

The feature reuses the app's two existing recording engines without modification:

1. **Playwright-codegen "new window"** (`server/routes/recorder.js` `POST /`): Spawns a real browser on the server's local machine, watches every click/type/navigation via Playwright's own `codegen` CLI, and writes ready-to-run Playwright code when the user closes that browser. A new `/generate` endpoint wraps this flow to add Claude generation.

2. **In-tab bookmarklet** (`server/routes/recorder.js` `POST /inpage/start`): Drops a small JavaScript snippet into a page you already have open; the injected script watches DOM events (clicks, form input, navigation) and posts them to the server as they happen. A selector quality falls back progressively: `#id` > `[data-testid]` > `name` attribute > CSS nth-of-type path. A new `/generate` endpoint wraps this flow similarly.

Both modes produce Playwright code synchronously (codegen outputs a `.js` file; in-tab events become code via `eventsToPlaywrightCode`). The `/generate` endpoints run *after* code exists, not as a mandatory wrapper, so the original "record, then save as test case" flow remains intact and unaffected.

---

## Claude Generation

When a user calls `/generate` on a recording, the server:

1. Extracts plain Playwright code from the session (either a file or computed from bookmarklet events).
2. Checks which parts of that code reuse known blocks (see Block Library, below).
3. Calls Claude with the code, a forced tool-call schema, and a hint about any matched blocks.
4. Claude returns structured JSON with summary, steps, cleaned code, and extracted test data.

### Tool Definition

The service exports `generateFromCode(client, { rawCode, matchedBlockNames })` (in `server/services/claudeGenerate.js`):

- **Input**: `rawCode` (raw Playwright code), `matchedBlockNames` (array of block names already matched to parts of this recording).
- **Output**: `{ summary, steps, code, testData }`
  - `summary`: One-sentence plain English description of what the test does.
  - `steps`: Array of `{ index, description, selector, confidence }`. Confidence is `'high'` (stable #id/data-testid/role selector) or `'low'` (CSS path or text-based fallback).
  - `code`: Cleaned Playwright code (prefer stable selectors, remove recorder noise).
  - `testData`: Object keyed by field name (e.g., `{ password: 'hunter2', email: 'user@example.com' }`).

### Forced Tool Call

The Claude prompt uses `tool_choice: {type: 'tool', name: 'generate_test'}` to ensure the response is always structured JSON, never free-form text. The tool schema defines:

```json
{
  "name": "generate_test",
  "input_schema": {
    "properties": {
      "summary": { "type": "string" },
      "steps": {
        "type": "array",
        "items": {
          "properties": {
            "description": { "type": "string" },
            "selector": { "type": "string" },
            "confidence": { "enum": ["low", "high"] }
          }
        }
      },
      "code": { "type": "string" },
      "testData": { "type": "object", "additionalProperties": { "type": "string" } }
    }
  }
}
```

### Matched-Block Hint

If the recording reuses part of an existing block (detected by `segmentByBlocks`, see Block Matching below), Claude receives a hint: `"These steps reuse the existing reusable block(s) '...' — mention reusing them instead of inlining their steps, in the plain-English summary."` Claude does not need to know the block library exists or how to interpret selectors — it only owns the natural-language layer.

---

## Data Masking

Sensitive test-data fields are masked to environment variable placeholders before being persisted, using `maskSensitiveFields(testData)` from `server/services/dataMasking.js`:

- Field names matching `/password/i`, `/passwd/i`, `/otp/i`, `/secret/i`, or `/token/i` are replaced with `$env:FIELDNAME_UPPERCASE`.
- Example: `{ password: 'hunter2', otpCode: '123456' }` becomes `{ password: '$env:PASSWORD', otpCode: '$env:OTPCODE' }`.
- Non-sensitive fields (email, vendor name, etc.) pass through unchanged.
- Masking runs *before* any generation or review-queue entry is written to disk, so plaintext secrets never touch the database.

---

## Block Library

The block library is a project-scoped, locked, admin-managed collection of reusable Playwright code fragments. Blocks are immutable (`locked: true` on all created blocks); users cannot edit them in-app. New blocks are created only by promoting a flagged generation (see Pending Review Queue, below) or directly via `POST /api/blocks` (admin only).

### Per-Step Segmentation

Instead of matching an entire recording against the block library on an all-or-nothing basis, the feature uses per-step segmentation: `segmentByBlocks(code, blocks)` from `server/services/blockMatcher.js` greedily walks the recording's selector sequence left to right. At each position, it finds the longest known block whose selector sequence matches the next N selectors and marks that span as a reused segment; anything that doesn't match a block becomes a one-selector "new" segment.

This means a recording that reuses the first three steps of a Login block and then adds a genuinely new step gets credit for the reuse — only the new step lands in review, not the entire flow.

### Selector Extraction

The block matcher extracts selectors from Playwright code via regex: any call to `page.click()`, `page.fill()`, `page.goto()`, etc. (with other methods supported) has its first argument captured as a selector. The extracted sequence is then matched greedily against stored block sequences.

### Block Attribution per Step

After Claude generates steps, each step is tagged with a block (if any) via `blockForSelector(segments, selector)`. This lookup is deterministic — Claude produces the step's natural-language description and confidence flag, but the server assigns the block without Claude needing to know the library exists.

### API Surface

- `GET /api/blocks?project=` (any authed user): Returns `{ blocks: [...] }`, all blocks scoped to the given project (or all blocks if project is omitted).
- `POST /api/blocks` (admin only): Accepts `{ project, name, code }`, creates a new locked block, returns `{ block: {...} }`.

---

## Pending Review Queue

Generations that don't match an existing block, or that have low-confidence locators, land in a pending review queue for admin triage. An admin can either approve (mark as a one-off test case, not a reusable block) or promote (create a new locked block from the code).

### Reasons for Review

An entry is queued when:

1. **Weak locator**: One or more generated steps have `confidence: 'low'` (a CSS path or text-based selector, not a stable #id/data-testid/role).
2. **No matching block**: The project has blocks on file, but none of them matched any part of this recording. (A project's very first recording is *not* forced into review just because the library is empty.)

The review entry stores `reason` (one of the above strings) and `flaggedSteps` (array of step indices that triggered review).

### API Surface

- `GET /api/review-queue?project=` (any authed user): Returns `{ entries: [...] }`, filtered by project.
- `POST /api/review-queue/:id/approve` (admin only): Updates the entry's status to `'approved'`, returns `{ entry: {...} }`.
- `POST /api/review-queue/:id/promote` (admin only): Accepts `{ blockName }`, creates a new locked block from the linked generation's code, updates the entry's status to `'promoted'`, returns `{ block: {...} }`.

---

## Automatic Test Naming

When Claude generates steps from code, the server automatically derives a `testCaseName` field using logic in `buildTestCaseName({ project, flowName, newSteps, totalSteps })`:

1. Start with the project name (slugified: lowercase, no special characters except underscore).
2. Append the flow name (slugified).
3. If some steps are new and some reuse a block (i.e., `newSteps.length > 0` AND `newSteps.length < totalSteps`), append a "short label" derived from the first new step's description: strip leading action verbs (`click`, `fill`, etc.) and keep the next couple of meaningful words.

Examples:
- Project: "Inbound", Flow: "Operator login", all steps new → `inbound_operator_login`
- Project: "Inbound", Flow: "Operator login", first new step: "Click zone override dropdown" → `inbound_operator_login_zone_override`

This naming mirrors the mockup's pattern without requiring any user input beyond the flow name.

---

## API Surface

All endpoints require the user to be authenticated (JWT cookie). Admin-gated endpoints additionally require `role === 'admin'`.

### Recorder Generation Endpoints

#### `POST /api/recorder/:id/generate`

Codegen "new window" mode.

**Request:**
```json
{
  "project": "Inbound",
  "flowName": "Operator login"
}
```

**Response (200):**
```json
{
  "recordingId": "a1b2c3d4e5f6g7h8",
  "project": "Inbound",
  "flowName": "Operator login",
  "testCaseName": "inbound_operator_login",
  "summary": "Logs in as an operator and navigates to the zone override screen.",
  "steps": [
    {
      "index": 0,
      "description": "Navigate to login page",
      "selector": "'http://localhost:3000/login'",
      "confidence": "high",
      "blockId": null,
      "blockName": null
    },
    {
      "index": 1,
      "description": "Fill email field",
      "selector": "'#email'",
      "confidence": "high",
      "blockId": 1,
      "blockName": "Login"
    }
  ],
  "code": "const { chromium } = require('playwright');\n\n(async () => {\n  const browser = await chromium.launch();\n  const page = await browser.newPage();\n  await page.goto('http://localhost:3000/login');\n  await page.fill('#email', 'operator@example.com');\n  await page.click('#submit');\n  ...",
  "testData": {
    "email": "operator@example.com"
  },
  "matchedBlockNames": ["Login"],
  "needsReview": false
}
```

#### `POST /api/recorder/inpage/:sessionId/generate`

In-tab bookmarklet mode.

**Request:** Same as above.

**Response:** Same shape as above.

### Block Library Endpoints

#### `GET /api/blocks?project=Inbound`

**Response (200):**
```json
{
  "blocks": [
    {
      "id": 1,
      "project": "Inbound",
      "name": "Login",
      "code": "await page.goto('http://localhost:3000/login');\nawait page.fill('#email', 'x');\nawait page.click('#submit');",
      "locked": true,
      "createdBy": "admin@stackbox.xyz",
      "createdAt": "2026-08-13T10:00:00.000Z"
    }
  ]
}
```

#### `POST /api/blocks` (admin only)

**Request:**
```json
{
  "project": "Inbound",
  "name": "Login",
  "code": "await page.goto('http://localhost:3000/login');\nawait page.fill('#email', 'x');\nawait page.click('#submit');"
}
```

**Response (200):**
```json
{
  "block": { "id": 2, "project": "Inbound", ... }
}
```

### Review Queue Endpoints

#### `GET /api/review-queue?project=Inbound`

**Response (200):**
```json
{
  "entries": [
    {
      "id": 1,
      "project": "Inbound",
      "recordingId": "a1b2c3d4e5f6g7h8",
      "reason": "weak locator",
      "flaggedSteps": [2, 3],
      "status": "pending",
      "createdAt": "2026-08-13T10:05:00.000Z"
    }
  ]
}
```

#### `POST /api/review-queue/:id/approve` (admin only)

**Response (200):**
```json
{
  "entry": { "id": 1, "status": "approved", ... }
}
```

#### `POST /api/review-queue/:id/promote` (admin only)

**Request:**
```json
{
  "blockName": "Zone Override"
}
```

**Response (200):**
```json
{
  "block": {
    "id": 3,
    "project": "Inbound",
    "name": "Zone Override",
    "code": "...",
    "locked": true,
    "createdBy": "admin@stackbox.xyz",
    "createdAt": "2026-08-13T10:06:00.000Z"
  }
}
```

---

## Implementation note (added during planning, 2026-08-13)

This spec's original mockup file (`qa-platform-mockup.html`) never existed anywhere in the user's filesystem — there was no separate dark-themed reference to copy CSS from. This spec was also meant to extend the dashboard's *existing* AI Recorder page in place, not stand up a new app or a second page.

The implementation plan at `docs/superpowers/plans/2026-08-13-ai-recorder-enhancements.md` therefore:
- Uses this app's real, existing light/card-based visual design instead of the spec's §1 dark tokens, which would have clashed with the rest of the dashboard.
- Reuses the existing Playwright-codegen and bookmarklet recording engines in `server/routes/recorder.js` instead of building a new one, adding only a Claude generation step on top of each.
- Reuses the existing project selector (`selectedProjectName()`) and real JWT-based admin roles instead of inventing new ones.
