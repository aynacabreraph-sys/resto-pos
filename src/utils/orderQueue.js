import db from '../db/database';
import { supabase } from '../db/database';

export async function reservePager(checkoutKey, staff) {
  const rows = await db.rpc('reserve_next_pager', { p_checkout_key: checkoutKey, p_staff_id: staff?.id || null, p_staff_name: staff?.name || null });
  const row = rows?.[0];
  if (!row) throw new Error('Could not reserve a pager.');
  return { id: row.queue_id, pagerNumber: row.pager_number, checkoutKey };
}

export async function cancelPager(checkoutKey) {
  try { await db.rpc('cancel_pager_reservation', { p_checkout_key: checkoutKey }); } catch (error) { console.error('Could not release pager', error); }
}

export async function activateQueue({ reservation, transaction, items, staff }) {
  const queuedAt = Date.now();
  await db.orderQueue.update(reservation.id, {
    transactionId: transaction.id, receiptNo: transaction.receiptNo, status: 'active', orderType: transaction.orderType,
    staffId: staff?.id, staffName: staff?.name, queuedAt,
  });
  const units = items.flatMap((item, transactionItemIndex) => Array.from({ length: Number(item.quantity || 1) }, (_, unitIndex) => ({
    queueId: reservation.id, transactionItemIndex, unitIndex, productId: item.productId, name: item.name, modifiers: item.modifiers || [], served: false,
  })));
  if (units.length) await db.orderQueueItems.bulkAdd(units);
  return { ...reservation, transactionId: transaction.id, receiptNo: transaction.receiptNo, status: 'active', queuedAt };
}

export async function markPagerHanded(queueId) {
  await db.orderQueue.update(queueId, { pagerHandedAt: Date.now() });
}

export async function loadActiveQueue() {
  const orders = await db.orderQueue.query({ filters: [{ field: 'status', op: 'eq', value: 'active' }], orderBy: 'queuedAt' });
  const items = await db.orderQueueItems.toArray();
  return orders.map(order => ({ ...order, items: items.filter(item => item.queueId === order.id).sort((a, b) => a.transactionItemIndex - b.transactionItemIndex || a.unitIndex - b.unitIndex) }));
}

export async function setQueueItemServed(item, served, queuedAt) {
  const servedAt = served ? Date.now() : null;
  await db.orderQueueItems.update(item.id, { served, servedAt, durationMs: served ? Math.max(0, servedAt - queuedAt) : null });
}

export async function completeQueueOrder(order) {
  const completedAt = Date.now();
  await db.orderQueue.update(order.id, { status: 'completed', completedAt, durationMs: Math.max(0, completedAt - Number(order.queuedAt || completedAt)) });
}

export async function reconcileReservedQueue(checkoutKey) {
  if (!checkoutKey) return null;
  const queue = await db.orderQueue.where('checkoutKey').equals(checkoutKey).first();
  if (!queue || queue.status !== 'reserved') return queue;
  const { data } = await supabase.from('transactions').select('*').eq('checkoutKey', checkoutKey).limit(1);
  const transaction = data?.[0];
  if (!transaction) return queue;
  return activateQueue({ reservation: { id: queue.id, pagerNumber: queue.pagerNumber, checkoutKey }, transaction, items: transaction.items || [], staff: { id: transaction.staffId, name: transaction.staffName } });
}
