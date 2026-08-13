const SENSITIVE_PATTERNS = [/password/i, /passwd/i, /otp/i, /secret/i, /token/i];

function maskSensitiveFields(testData) {
  const masked = {};
  for (const [key, value] of Object.entries(testData || {})) {
    masked[key] = SENSITIVE_PATTERNS.some((p) => p.test(key)) ? `$env:${key.toUpperCase()}` : value;
  }
  return masked;
}

// Masking the extracted `testData` object isn't enough on its own: the cleaned
// Playwright code Claude returns still carries the typed-in values inline
// (`.fill('123456789')` for a password field), and that code text gets
// persisted — and, once promoted, becomes a shared block. So every value that
// `maskSensitiveFields` decided to mask is also swapped out of the code text
// for its `$env:NAME` placeholder.
//
// Deliberately a literal (split/join) replacement rather than a regex: secrets
// routinely contain characters that mean something in a regex, and there's no
// pattern to express here — just "this exact quoted string".
function maskSensitiveValuesInCode(code, testData, maskedTestData) {
  let out = String(code || '');
  for (const [key, maskedValue] of Object.entries(maskedTestData || {})) {
    if (typeof maskedValue !== 'string' || !maskedValue.startsWith('$env:')) continue;
    const original = (testData || {})[key];
    // Only non-empty strings: replacing '' would rewrite every empty string
    // literal in the file.
    if (typeof original !== 'string' || original === '') continue;
    for (const quote of ["'", '"', '`']) {
      out = out.split(quote + original + quote).join(quote + maskedValue + quote);
    }
  }
  return out;
}

module.exports = { maskSensitiveFields, maskSensitiveValuesInCode };
