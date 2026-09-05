export const SENSITIVE_KEYS = new Set([
  'pin', 'pinHash', 'photo', 'photoIn', 'photoOut', 'profileImage', 'paymentEvidencePhoto',
]);

export function sanitizeBackup(value) {
  if (Array.isArray(value)) return value.map(sanitizeBackup);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    SENSITIVE_KEYS.has(key) ? (nested ? '[REDACTED]' : nested) : sanitizeBackup(nested),
  ]));
}
