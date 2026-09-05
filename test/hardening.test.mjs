import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createConsumptionSnapshot } from '../src/utils/consumption.js';
import { sanitizeBackup } from '../src/utils/security.js';

test('consumption snapshots merge base and modifier use at four decimals', () => {
  const snapshot = createConsumptionSnapshot({
    ingredientLinks: [{ ingredientId: 1, quantity: 0.12555 }, { ingredientId: 1, quantity: 0.1 }],
    inventoryLinks: [{ inventoryId: 9, quantity: 1 }],
    ingredients: [{ id: 1, name: 'Milk', unit: 'oz' }],
    inventory: [{ id: 9, name: 'Cup' }],
    quantity: 2,
  });
  assert.deepEqual(snapshot.ingredients, [{ id: 1, quantity: 0.4511, name: 'Milk', unit: 'oz' }]);
  assert.deepEqual(snapshot.inventory, [{ id: 9, quantity: 2, name: 'Cup' }]);
});

test('operational backups recursively redact PIN and photo bodies', () => {
  const backup = sanitizeBackup({ staff: [{ pinHash: 'secret', name: 'Owner' }], transaction: { paymentEvidencePhoto: 'data:image/jpeg', nested: { photo: 'body' } } });
  assert.equal(backup.staff[0].pinHash, '[REDACTED]');
  assert.equal(backup.transaction.paymentEvidencePhoto, '[REDACTED]');
  assert.equal(backup.transaction.nested.photo, '[REDACTED]');
  assert.equal(backup.staff[0].name, 'Owner');
});

test('hardening migration keeps checkout and void writes inside database RPCs', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260825_full_sweep_hardening.sql', import.meta.url), 'utf8');
  assert.match(sql, /function public\.finalize_pos_checkout/);
  assert.match(sql, /function public\.void_pos_transaction/);
  assert.match(sql, /consumptionSnapshot/);
  assert.match(sql, /crypt\(p_pin/);
  assert.match(sql, /on conflict \("businessDate"\) do update/);
  assert.match(sql, /is_pos_session_active/);
  assert.match(sql, /revoke all on public\.staff from anon, authenticated/);
  assert.match(sql, /Insufficient stock for ingredient/);
});
