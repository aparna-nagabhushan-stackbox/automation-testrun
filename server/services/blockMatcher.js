const SELECTOR_CALL = /page\.(?:click|fill|check|uncheck|press|selectOption|goto)\(([^)]*)\)/g;

function extractSelectors(code) {
  const selectors = [];
  let match;
  const re = new RegExp(SELECTOR_CALL);
  while ((match = re.exec(code || ''))) {
    selectors.push(match[1].split(',')[0].trim());
  }
  return selectors;
}

// Greedily walks the recording's selector sequence left to right. At each
// position, the longest known block whose selector sequence matches the
// next N selectors wins and becomes one segment; anything that doesn't
// start a known block becomes its own one-selector "new" segment. This is
// what lets a recording reuse part of a block (e.g. a shared Login) while
// only the genuinely new steps land in review.
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

// Looks up which segment (and therefore which block, if any) a given
// generated step's selector belongs to, so a step can be labeled "Block:
// Login" without Claude ever needing to know the block library exists.
function blockForSelector(segments, selector) {
  const seg = segments.find((s) => s.selectors.includes(selector));
  return seg && seg.blockId ? { blockId: seg.blockId, blockName: seg.blockName } : null;
}

module.exports = { extractSelectors, segmentByBlocks, blockForSelector };
