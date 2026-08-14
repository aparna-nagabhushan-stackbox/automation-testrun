# Test Plan Feature — Design

Status: approved by user, pending implementation plan
Date: 2026-08-14

## Context

StackTest (this app) needs a Test Plan feature: a QA Lead organizes a testing
cycle by grouping test cases from the repository into named "Features," each
assigned to one tester with a date range, and tracks progress automatically
from execution results rather than manual status entry.

The originally-requested spec assumed a Postgres + React stack with an
existing server-side Test Case Repository and Execution module. Neither
assumption holds here:

- This app is a single JSON-file-per-collection Node/Express backend
  (`server/db.js`) and a single-file vanilla-JS frontend (`index.html`) — no
  Postgres, no React, no build step.
- Test cases today live **only in browser localStorage**
  (`stacktest_testcases`), created/edited via `loadTestCases()` /
  `saveTestCases()` in `index.html`. They are invisible across browsers and
  across users. There is no server-side Execution module — only a per-case
  `results: { Staging, UAT, PreProd }` grid (`NOT_TESTED` / `PASS` / `FAIL`
  / `BLOCKED` / `IN_PROGRESS`), editable manually per test case, plus a
  separate single `status` field added earlier this session.

Because Test Plans are inherently a shared, cross-tester feature (a Lead
assigns work to testers and must see their results), this design is split
into two phases:

- **Phase 1** moves the Test Case Repository (and its existing `results`
  grid) to server-side storage, with no change to its data shape — just
  where it lives. This alone fixes cross-browser/cross-user visibility of
  test cases, independent of Test Plans.
- **Phase 2** builds the Test Plan feature on top of Phase 1's server-side
  repository.

Each phase gets its own implementation plan; Phase 2 cannot start until
Phase 1 ships, since `Feature.testCaseIds` references the Phase 1
repository.

## Phase 1 — Server-side Test Case Repository

### Data model

New JSON-file collection, following the exact pattern already used by
`blocks.json` / `reviewQueue.json` / `generations.json` in `server/db.js` —
`readJson`/`writeJson`, incrementing integer `id`, no native dependencies.

```
server/data/testcases.json — array of:

TestCase {
  id: number
  title: string
  type: 'manual' | 'automation'
  module: string
  project: string            // '' if untagged
  priority: 'P0'|'P1'|'P2'|'P3'
  scenario: string
  platform: 'Web'|'App'|'Both'
  preCondition: string
  steps: string              // newline-separated, same shape as today
  testData: string
  expected: string
  actualResult: string
  status: 'NOT_RUN'|'PASS'|'FAIL'|'HOLD'|'DUPLICATE'
  results: { Staging: ResultState, UAT: ResultState, PreProd: ResultState }
    // ResultState = 'NOT_TESTED'|'PASS'|'FAIL'|'BLOCKED'|'IN_PROGRESS'
  aiGenerated: boolean
  createdBy: string          // email
  createdAt: string          // ISO timestamp
}
```

This is a direct superset/rename of the object shape `addTestCase()` /
`saveEditTC()` already build client-side today — no new fields invented,
just relocated.

### Routes (`server/routes/testcases.js`, mounted at `/api/test-cases`)

All `requireAuth`. Write access matches how the rest of the app treats
test-case authorship — any logged-in user can create/edit/delete (same as
today's localStorage behavior); there's no admin-gating on test case CRUD
elsewhere in the app, so Phase 1 doesn't introduce one either.

- `GET /api/test-cases?module=&project=` — list, optionally filtered.
- `POST /api/test-cases` — create.
- `PATCH /api/test-cases/:id` — update (including `status`/`results`, i.e.
  what today's Edit modal and the inline Status dropdown write).
- `DELETE /api/test-cases/:id` — delete.
- `POST /api/test-cases/import` — bulk-create from an array (used by the
  one-time local-storage migration below, and reused by the existing
  CSV-import feature instead of writing straight to localStorage).

### Migration mechanics

Silently auto-uploading every browser's localStorage on first load risks
duplicate/conflicting data if different people already have different local
test cases. Instead:

- If `localStorage.stacktest_testcases` has data on page load, show a
  one-time banner: **"Import my local test cases to the server"**.
- Clicking it calls `POST /api/test-cases/import` with the local list,
  dedup'd by `id` against what the server already has (server wins on
  conflict — it's presumed to be the shared source once Phase 1 ships).
- Once imported (or dismissed), the banner doesn't show again
  (`localStorage.stacktest_testcases_migrated = '1'`); localStorage stops
  being read for test cases from then on.

### Frontend rewrite

Every function currently reading/writing `stacktest_testcases` becomes an
`await api(...)` call instead: `loadTestCases`/`saveTestCases` (removed —
callers switch to `GET`/`PATCH`/`POST`/`DELETE` directly), `addTestCase`,
`editTC`, `saveEditTC`, `deleteTC`, `renderTestCases`, `updateTcStatus`,
`importTestCases`, `exportTestCases`, `downloadSampleTestCases` (unchanged —
client-side file generation), the Generate-Testcase save flow
(`saveGeneratedTestCase`, `saveAllGeneratedTestCases`), and
`selectedProjectName()`-based filtering. `renderDashboard()`'s test-case
counts move from a sync localStorage read to an async fetch.

## Phase 2 — Test Plan feature

### Data model

One JSON-file collection, features embedded in their parent plan — a
feature is only ever read/written in the context of its plan, so no
separate join table.

```
server/data/testplans.json — array of:

TestPlan {
  id: number
  name: string
  startDate: string           // ISO date
  endDate: string
  environment: 'Staging'|'UAT'|'PreProd'
  ownerEmail: string
  testerLoadThresholds: { warn: number, overload: number }  // default { warn: 15, overload: 25 }
  createdAt: string
  features: Feature[]
}

Feature {
  id: number
  name: string
  tag: string                 // filters against TestCase.module — see note below
  assigneeEmail: string
  startDate: string
  endDate: string
  dependsOnFeatureId: number | null   // another feature's id, same plan
  blockedReason: string | null        // manual block; null = not manually blocked
  testCaseIds: number[]        // references into Phase 1's testcases.json
  createdAt: string
}
```

**Naming note:** the original spec's "tag" maps onto this app's existing
`module` field — there is no separate multi-tag system on test cases today,
and adding one is out of scope here (YAGNI) unless you want it as a
follow-up. Filtering "by tag" in the Add Feature panel means filtering by
`TestCase.module`.

**No stored per-case pass/fail on the Feature.** A feature's cases are just
`testCaseIds`; status is always read live from that test case's own
`results[plan.environment]` in the Phase 1 repository, per your instruction
to avoid a second source of truth for pass/fail.

### Computed status algorithm

Computed on every read (`GET /api/plans/:id`), never stored:

```
function computeFeatureStatus(feature, plan, allFeatures, visited = new Set()):
  if feature.blockedReason:
    return { status: 'Blocked', reason: 'manual', blockedReason: feature.blockedReason }

  if feature.dependsOnFeatureId:
    if visited.has(feature.id): # cycle guard — misconfigured plan
      # treat as unresolved rather than infinite-loop; surfaced to the
      # Lead as a data problem, not silently ignored
      return { status: 'Blocked', reason: 'dependency-cycle' }
    dep = allFeatures.find(f => f.id === feature.dependsOnFeatureId)
    depStatus = computeFeatureStatus(dep, plan, allFeatures, visited + feature.id)
    if depStatus.status !== 'Done':
      return { status: 'Blocked', reason: 'dependency', dependsOn: dep.name }

  results = feature.testCaseIds.map(id => testCase(id).results[plan.environment])
  total = results.length
  doneCount = results.filter(r => r !== 'NOT_TESTED').length
  passCount = results.filter(r => r === 'PASS').length

  if doneCount === 0: return { status: 'Not Started' }
  if passCount === total: return { status: 'Done' }
  return { status: 'In Progress', progress: { done: doneCount, total } }
```

`GET /plans/:id` returns each feature with this computed block plus its
resolved case list (id, title, module, and live `results[environment]` per
case) so the frontend never has to re-derive it.

### Tester Load

`GET /api/plans/:id/tester-load` sums `testCaseIds.length` per
`assigneeEmail` across that plan's features:

```
[{ email, testCaseCount, level: 'normal'|'full'|'overloaded' }]
```

`level` compares `testCaseCount` against `plan.testerLoadThresholds`
(`< warn` → normal, `>= warn` and `< overload` → full, `>= overload` →
overloaded). Recomputed fresh on every call — no caching — so creating or
reassigning a Feature is reflected immediately on next fetch, satisfying
"this should update immediately."

### API summary

- `POST /api/plans` — `{ name, startDate, endDate, environment, testerLoadThresholds? }`
- `GET /api/plans` — list (id, name, dates, environment — for a plans index page)
- `GET /api/plans/:id` — full plan, each feature with computed status + resolved cases
- `POST /api/plans/:id/features` — `{ name, tag, assigneeEmail, startDate, endDate, dependsOnFeatureId?, testCaseIds }`
- `PATCH /api/plans/:id/features/:featureId` — edit any field, including `blockedReason` and reassignment
- `GET /api/plans/:id/tester-load`

**Auth:** viewing (`GET`) open to any logged-in user. Creating/editing plans
and features restricted to `role === 'admin'` — this app has no distinct
"QA Lead" role, and gating writes to admin mirrors how `blocks.js` already
treats project-wide, shared configuration. Flag if a separate Lead role is
wanted instead.

### Frontend

Built into the existing single-file `index.html`, replacing the current
"Coming soon" placeholder at `#page-testplans` — vanilla JS, matching every
other page in this app, not a separate React app.

- **Plan screen header:** Tester Load bar — one pill per tester
  (avatar-initial + name + count), colored by `level`. Refetches after any
  Feature create/edit.
- **Feature cards:** name, tag (module) badge, assignee, date range,
  computed status pill (`Not Started` / `In Progress (x/y)` / `Done` /
  `Blocked` — with reason on hover for Blocked), and a "Depends on: X" badge
  when set. Click to expand → list of attached test cases with their live
  per-environment result.
- **"+ Add Feature" panel:** name input → tag/module filter chips (pulled
  from distinct `module` values already in the repository) → checklist of
  matching cases (checked by default, individually toggleable) → a manual
  add-case search box (searches all repository cases by title/module, not
  just the filtered set) → assignee dropdown (from `GET /api/team/users`,
  same source as Team Members) → start/end date → optional "depends on"
  dropdown listing this plan's other features.

## Open items / assumptions carried into implementation

- Assignee/owner identity is email (this app has no numeric user IDs
  exposed anywhere — `team.js` already keys everything off email).
- "Active Features" for tester load = all features in the plan being
  viewed (the endpoint is plan-scoped per the API contract, not a
  cross-plan rollup). Cross-plan load is a possible future addition, not
  built here.
- No notion of a Test Plan being "closed/archived" yet — out of scope
  unless requested.
