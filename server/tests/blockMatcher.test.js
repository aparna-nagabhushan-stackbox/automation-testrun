const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSelectors, segmentByBlocks, segmentForStepIndex } = require('../services/blockMatcher');

const LOGIN_CODE = `
await page.goto('http://x/login');
await page.fill('#email', 'user@stackbox.xyz');
await page.click('#submit');
`;

// Trimmed from a real recording this app produced
// (server/recordings/cc2cd09e97fdc506.js) — this is what Playwright's own
// codegen emits for "Record in new window", and it is the form the old
// page.<action>('sel') regex missed entirely.
const CODEGEN_LOGIN_CODE = `
  await page.goto('http://localhost:3000/');
  await page.getByRole('textbox', { name: 'Enter your email' }).click();
  await page.getByRole('textbox', { name: 'Enter your email' }).fill('tanuja@stackbox.xyz');
  await page.getByRole('textbox', { name: 'Enter password' }).click();
  await page.getByRole('textbox', { name: 'Enter password' }).fill('123456789');
  await page.getByRole('button', { name: 'Login' }).click();
`;

test('extractSelectors returns legacy page.* arguments with the JS quotes stripped', () => {
  // Bare strings, so a key is directly comparable to a selector as anyone else
  // would write it — quotes used to be baked into every key.
  assert.deepEqual(extractSelectors(LOGIN_CODE), ['http://x/login', '#email', '#submit']);
});

test('extractSelectors treats single and double quoted selectors as the same key', () => {
  assert.deepEqual(extractSelectors(`await page.click("#submit");`), extractSelectors(`await page.click('#submit');`));
});

test('extractSelectors recognizes the modern locator API real codegen emits', () => {
  assert.deepEqual(extractSelectors(CODEGEN_LOGIN_CODE), [
    'http://localhost:3000/',
    "getByRole('textbox', { name: 'Enter your email' })",
    "getByRole('textbox', { name: 'Enter your email' })",
    "getByRole('textbox', { name: 'Enter password' })",
    "getByRole('textbox', { name: 'Enter password' })",
    "getByRole('button', { name: 'Login' })",
  ]);
});

test('extractSelectors covers the other getBy* factories, locator(), and secondary pages', () => {
  const code = `
    await page.getByLabel('Vendor').fill('Acme');
    await page.getByPlaceholder('Search').press('Enter');
    await page.getByTestId('confirm').click();
    await page.getByText('Automation').click();
    await page.locator('.zone-override-dd').click();
    await page1.goto('http://second-tab/');
  `;
  assert.deepEqual(extractSelectors(code), [
    "getByLabel('Vendor')",
    "getByPlaceholder('Search')",
    "getByTestId('confirm')",
    "getByText('Automation')",
    "locator('.zone-override-dd')",
    'http://second-tab/',
  ]);
});

test('extractSelectors ignores locators that are only asserted on, not interacted with', () => {
  assert.deepEqual(extractSelectors(`await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();`), []);
});

test('segmentByBlocks groups a known block prefix into one segment and leaves the rest as new steps', () => {
  const block = { id: 1, name: 'Login', code: LOGIN_CODE };
  const recording = LOGIN_CODE + `await page.click('.zone-override-dd');\n`;
  const segments = segmentByBlocks(recording, [block]);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].blockId, 1);
  assert.deepEqual(segments[0].selectors, ['http://x/login', '#email', '#submit']);
  assert.equal(segments[1].blockId, null);
  assert.deepEqual(segments[1].selectors, ['.zone-override-dd']);
});

test('segmentByBlocks matches a codegen-recorded block against a longer codegen recording', () => {
  // The end-to-end case the old regex broke: block AND recording are both raw
  // codegen output using the modern locator API.
  const block = { id: 7, name: 'Login', code: CODEGEN_LOGIN_CODE };
  const recording = CODEGEN_LOGIN_CODE + `  await page.getByRole('button', { name: '+ Create Test Case' }).click();\n`;
  const segments = segmentByBlocks(recording, [block]);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].blockId, 7);
  assert.equal(segments[0].selectors.length, 6);
  assert.equal(segments[1].blockId, null);
  assert.deepEqual(segments[1].selectors, ["getByRole('button', { name: '+ Create Test Case' })"]);
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

test('segmentForStepIndex maps a step position onto the segment covering it', () => {
  const segments = [
    { selectors: ['http://x/login', '#email', '#submit'], blockId: 1, blockName: 'Login' },
    { selectors: ['.zone-override-dd'], blockId: null, blockName: null },
  ];
  assert.equal(segmentForStepIndex(segments, 0).blockName, 'Login');
  assert.equal(segmentForStepIndex(segments, 2).blockName, 'Login');
  assert.equal(segmentForStepIndex(segments, 3).blockId, null);
});

test('segmentForStepIndex returns null for an out-of-range or invalid index', () => {
  const segments = [{ selectors: ['#a'], blockId: 1, blockName: 'Login' }];
  assert.equal(segmentForStepIndex(segments, 1), null);
  assert.equal(segmentForStepIndex(segments, -1), null);
  assert.equal(segmentForStepIndex(segments, undefined), null);
  assert.equal(segmentForStepIndex([], 0), null);
});
