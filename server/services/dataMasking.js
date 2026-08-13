const SENSITIVE_PATTERNS = [/password/i, /passwd/i, /otp/i, /secret/i, /token/i];

function maskSensitiveFields(testData) {
  const masked = {};
  for (const [key, value] of Object.entries(testData || {})) {
    masked[key] = SENSITIVE_PATTERNS.some((p) => p.test(key)) ? `$env:${key.toUpperCase()}` : value;
  }
  return masked;
}

module.exports = { maskSensitiveFields };
