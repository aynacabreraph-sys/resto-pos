import db from '../db/database';

const PRIVATE_KEYS = new Set(['pin', 'photo', 'photoIn', 'photoOut', 'profileImage']);
export function sanitizeAuditState(state) {
  if (!state) return null;
  return Object.fromEntries(Object.entries(state).filter(([key]) => !PRIVATE_KEYS.has(key)).map(([key, value]) => [key, typeof value === 'object' && value !== null ? '[structured data]' : value]));
}

export function describeChanges(beforeState, afterState) {
  const before = sanitizeAuditState(beforeState) || {};
  const after = sanitizeAuditState(afterState) || {};
  const labels = { inStock: 'Stock', unitCost: 'Unit cost', lowThreshold: 'Low threshold', priceDelta: 'Price delta', hourlyRate: 'Hourly rate' };
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => String(before[key] ?? '') !== String(after[key] ?? ''))
    .map(key => `${labels[key] || key}: ${before[key] ?? '—'} → ${after[key] ?? '—'}`).join('; ');
}

export async function writeAudit({ action, entityType, entity, entityId, staff, beforeState = null, afterState = null, details = '' }) {
  const before = sanitizeAuditState(beforeState);
  const after = sanitizeAuditState(afterState);
  return db.auditLog.add({ action, entityType, entity, entityId, staffId: staff?.id, staffName: staff?.name, datetime: Date.now(), details: details || describeChanges(before, after), beforeState: before, afterState: after });
}
