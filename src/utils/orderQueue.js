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
  const rows = await db.rpc('activate_reserved_queue', {
    p_checkout_key: reservation.checkoutKey, p_transaction_id: transaction.id, p_receipt_no: transaction.receiptNo,
    p_order_type: transaction.orderType, p_staff_id: staff?.id || null, p_staff_name: staff?.name || null, p_items: items,
  });
  const row = rows?.[0];
  if (!row) throw new Error('Could not activate the queue order.');
  return { ...reservation, id: row.queue_id, pagerNumber: row.pager_number, transactionId: transaction.id, receiptNo: transaction.receiptNo, status: 'active', queuedAt: row.queued_at };
}

export async function markPagerHanded(queueId) {
  await db.orderQueue.update(queueId, { pagerHandedAt: Date.now() });
}

export async function loadActiveQueue() {
  return loadQueueOrders('active');
}

export async function loadCompletedQueue(start, end) {
  return loadQueueOrders('completed', start, end);
}

async function loadQueueOrders(status, start, end) {
  let query = supabase.from('order_queue').select('*,order_queue_items(*)').eq('status', status);
  if (start) query = query.gte('completedAt', start);
  if (end) query = query.lte('completedAt', end);
  query = query.order(status === 'active' ? 'queuedAt' : 'completedAt', { ascending: status === 'active' });
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(({ order_queue_items: items = [], ...order }) => ({
    ...order,
    items: items.sort((a, b) => a.transactionItemIndex - b.transactionItemIndex || a.unitIndex - b.unitIndex),
  }));
}

export async function setQueueItemServed(item, served, queuedAt) {
  const row = (await db.rpc('set_queue_item_status', { p_item_id: item.id, p_served: served }))?.[0];
  return { servedAt: row?.servedAt ?? null, durationMs: row?.durationMs ?? null };
}

export async function completeQueueOrder(order) {
  return db.rpc('complete_queue_order', { p_queue_id: order.id });
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
