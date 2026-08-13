const test = require('node:test');
const assert = require('node:assert/strict');
const { maskSensitiveFields } = require('../services/dataMasking');

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
