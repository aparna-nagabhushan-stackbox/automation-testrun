// Turns recorded Playwright code into a comparable sequence of "interaction
// keys", then uses that sequence to work out which spans of a new recording
// re-run a known block.
//
// Two call forms have to be recognised, because two different recorders feed
// this module:
//   * the legacy page-level API — `page.click('#submit')`,
//     `page.fill('#email', 'x')`, `page.goto(url)` — which is what the in-tab
//     bookmarklet recorder emits, and
//   * the modern locator API — `page.getByRole('button', { name: 'Submit' })
//     .click()`, `page.getByTestId('x').fill('y')`, `page.locator('sel')
//     .click()` — which is what Playwright's own codegen ("Record in new
//     window") emits.
// Only recognising the first form meant every codegen recording extracted to
// little more than its opening `goto`, so no block ever matched.
//
// `page\d*` rather than plain `page` because codegen names secondary tabs
// `page1`, `page2`, … and interactions on those are still part of the flow.
const LEGACY_ACTIONS = 'click|fill|check|uncheck|press|selectOption|goto';
const LOCATOR_FACTORIES = 'getByRole|getByLabel|getByPlaceholder|getByTestId|getByText|getByTitle|getByAltText|locator';
const LOCATOR_ACTIONS = 'click|fill|check|uncheck|press|selectOption|type|setChecked';

// Alternation in one global regex so matches come back in source order — the
// ORDER of interactions is the whole basis of both block matching and
// (in recorder.js) per-step block attribution.
// Modern branch groups: 1 = factory name, 2 = its raw args, 3 = any chained
// locator refinements (`.first()`, a nested `.getByRole(...)`, …).
// Legacy branch groups: 4 = action name, 5 = its raw args.
// An action call is REQUIRED on the modern branch so that assertions
// (`await expect(page.getByRole(...)).toBeVisible()`) aren't counted as
// interactions.
const INTERACTION_CALL = new RegExp(
  `\\bpage\\d*\\.(${LOCATOR_FACTORIES})\\(([^)]*)\\)((?:\\s*\\.\\w+\\([^)]*\\))*)\\s*\\.(?:${LOCATOR_ACTIONS})\\(`
  + '|'
  + `\\bpage\\d*\\.(${LEGACY_ACTIONS})\\(([^)]*)\\)`,
  'g'
);

function normalizeSpace(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

// Pulls the first argument of a legacy `page.<action>(...)` call out as a bare
// string — WITHOUT the JS quote characters. Keeping the quotes (as this used
// to) made every key un-comparable to anything that didn't come from the same
// extraction pass, and made `'#a'` vs `"#a"` look like different selectors.
function firstArgKey(argText) {
  const s = String(argText || '').trim();
  // Match a complete leading string literal (any quote style, escapes
  // honoured) so a selector containing a comma — `'div, span'` — survives.
  const literal = /^(['"`])((?:\\.|(?!\1)[^\\])*)\1/.exec(s);
  if (literal) return literal[2];
  // Not a plain string literal (a variable, a template with `${…}`) — fall
  // back to the first comma-delimited chunk verbatim. Symmetric on both sides
  // of a comparison, which is all that matters here.
  return s.split(',')[0].trim();
}

// Returns one normalized key per recognised interaction, in source order.
// The key format is internal — nothing outside this module should parse it;
// it only has to be stable and exactly comparable between two pieces of code
// produced by the same recorder.
function extractSelectors(code) {
  const selectors = [];
  const re = new RegExp(INTERACTION_CALL);
  let match;
  while ((match = re.exec(code || ''))) {
    if (match[1]) {
      // Modern locator API: `getByRole('button', { name: 'Submit' })`.
      selectors.push(normalizeSpace(`${match[1]}(${match[2]})${match[3] || ''}`));
    } else {
      selectors.push(firstArgKey(match[5]));
    }
  }
  return selectors;
}

// Greedily walks the recording's interaction sequence left to right. At each
// position, the longest known block whose sequence matches the next N
// interactions wins and becomes one segment; anything that doesn't start a
// known block becomes its own one-interaction "new" segment. This is what
// lets a recording reuse part of a block (e.g. a shared Login) while only the
// genuinely new steps land in review.
function segmentByBlocks(code, blocks) {
  const selectors = extractSelectors(code);
  const blockSeqs = (blocks || [])
    .map((b) => ({ block: b, seq: extractSelectors(b.code) }))
    .filter((b) => b.seq.length > 0)
    .sort((a, b) => b.seq.length - a.seq.length); // longest match wins at a given position

  const segments = [];
  let i = 0;
  while (i < selectors.length) {
    const found = blockSeqs.find(({ seq }) =>
      seq.length <= selectors.length - i && seq.every((s, j) => s === selectors[i + j])
    );
    if (found) {
      segments.push({ selectors: found.seq, blockId: found.block.id, blockName: found.block.name });
      i += found.seq.length;
    } else {
      segments.push({ selectors: [selectors[i]], blockId: null, blockName: null });
      i += 1;
    }
  }
  return segments;
}

// Which segment (and therefore which block, if any) a given generated step
// belongs to, resolved by POSITION rather than by selector text.
//
// Attribution used to try to find a segment containing Claude's `selector`
// string, but Claude returns a bare selector (`#submit`) while extraction
// works from raw source text — and for the modern locator API there is no
// single "selector string" to compare at all. Position is the honest join:
// `segments` are in recording order, and Claude is asked for one step per
// meaningful interaction, so step N falls inside the segment covering the Nth
// extracted interaction. Out-of-range indexes return null (no block tag)
// rather than guessing.
function segmentForStepIndex(segments, index) {
  if (!Array.isArray(segments) || !Number.isInteger(index) || index < 0) return null;
  let start = 0;
  for (const segment of segments) {
    const length = segment.selectors.length;
    if (index < start + length) return segment;
    start += length;
  }
  return null;
}

module.exports = { extractSelectors, segmentByBlocks, segmentForStepIndex };
