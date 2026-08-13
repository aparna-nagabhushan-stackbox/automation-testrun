const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSelectors, segmentByBlocks, blockForSelector } = require('../services/blockMatcher');

const LOGIN_CODE = `
await page.goto('http://x/login');
await page.fill('#email', 'user@stackbox.xyz');
await page.click('#submit');
`;

test('extractSelectors pulls the first argument out of each page.* call in order', () => {
  assert.deepEqual(extractSelectors(LOGIN_CODE), ["'http://x/login'", "'#email'", "'#submit'"]);
});

test('segmentByBlocks groups a known block prefix into one segment and leaves the rest as new steps', () => {
  const block = { id: 1, name: 'Login', code: LOGIN_CODE };
  const recording = LOGIN_CODE + `await page.click('.zone-override-dd');\n`;
  const segments = segmentByBlocks(recording, [block]);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].blockId, 1);
  assert.deepEqual(segments[0].selectors, ["'http://x/login'", "'#email'", "'#submit'"]);
  assert.equal(segments[1].blockId, null);
  assert.deepEqual(segments[1].selectors, ["'.zone-override-dd'"]);
});

test('segmentByBlocks returns all-new segments when no block matches', () => {
  const segments = segmentByBlocks(`await page.click('#other');`, []);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].blockId, null);
});

test('segmentByBlocks prefers the longest matching block at a given position', () => {
  const shortBlock = { id: 1, name: 'Short', code: `await page.goto('http://x/login');` };
  const longBlock = { id: 2, name: 'Login', code: LOGIN_CODE };
  const segments = segmentByBlocks(LOGIN_CODE, [shortBlock, longBlock]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].blockId, 2);
});

test('blockForSelector finds the segment containing a given selector', () => {
  const segments = [
    { selectors: ["'#email'", "'#submit'"], blockId: 1, blockName: 'Login' },
    { selectors: ["'.x'"], blockId: null, blockName: null },
  ];
  assert.deepEqual(blockForSelector(segments, "'#submit'"), { blockId: 1, blockName: 'Login' });
  assert.equal(blockForSelector(segments, "'.x'"), null);
});
