const test = require('node:test');
const assert = require('node:assert/strict');
const { maskSensitiveFields, maskSensitiveValuesInCode } = require('../services/dataMasking');

test('masks password, otp, secret, and token fields', () => {
  const masked = maskSensitiveFields({ password: 'hunter2', otpCode: '123456', apiSecret: 'x', authToken: 'y' });
  assert.equal(masked.password, '$env:PASSWORD');
  assert.equal(masked.otpCode, '$env:OTPCODE');
  assert.equal(masked.apiSecret, '$env:APISECRET');
  assert.equal(masked.authToken, '$env:AUTHTOKEN');
});

test('leaves non-sensitive fields untouched', () => {
  const masked = maskSensitiveFields({ vendorName: 'Acme Corp', email: 'user@stackbox.xyz' });
  assert.equal(masked.vendorName, 'Acme Corp');
  assert.equal(masked.email, 'user@stackbox.xyz');
});

test('handles an empty or missing testData object', () => {
  assert.deepEqual(maskSensitiveFields(undefined), {});
  assert.deepEqual(maskSensitiveFields({}), {});
});

test('maskSensitiveValuesInCode swaps masked values out of the code text, whatever the quote style', () => {
  const testData = { password: 'hunter2', vendor: 'Acme' };
  const masked = maskSensitiveFields(testData);
  const code = `await page.fill('#pwd', 'hunter2');\nawait page.fill("#pwd2", "hunter2");\nawait page.fill('#vendor', 'Acme');`;
  const out = maskSensitiveValuesInCode(code, testData, masked);
  assert.ok(!out.includes('hunter2'));
  assert.match(out, /'\$env:PASSWORD'/);
  assert.match(out, /"\$env:PASSWORD"/);
  // Non-sensitive values stay readable.
  assert.match(out, /'Acme'/);
});

test('maskSensitiveValuesInCode leaves secrets containing regex metacharacters intact-but-replaced', () => {
  const testData = { password: 'a.*b(c)$' };
  const masked = maskSensitiveFields(testData);
  const out = maskSensitiveValuesInCode(`await page.fill('#pwd', 'a.*b(c)$');`, testData, masked);
  assert.equal(out, `await page.fill('#pwd', '$env:PASSWORD');`);
});

test('maskSensitiveValuesInCode never rewrites empty strings or missing code', () => {
  const testData = { password: '' };
  const masked = maskSensitiveFields(testData);
  assert.equal(maskSensitiveValuesInCode(`await page.fill('#a', '');`, testData, masked), `await page.fill('#a', '');`);
  assert.equal(maskSensitiveValuesInCode(undefined, {}, {}), '');
});
