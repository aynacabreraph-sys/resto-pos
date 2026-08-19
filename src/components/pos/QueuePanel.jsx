import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { completeQueueOrder, loadActiveQueue, setQueueItemServed } from '../../utils/orderQueue';
import { useAuthStore } from '../../stores/authStore';
import { writeAudit } from '../../utils/audit';

function elapsedLabel(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export default function QueuePanel({ open, onClose, onCountChange }) {
  const [orders, setOrders] = useState([]);
  const [now, setNow] = useState(Date.now());
  const staff = useAuthStore(state => state.currentStaff);
  async function refresh() { const rows = await loadActiveQueue(); setOrders(rows); onCountChange?.(rows.length); }
  useEffect(() => { refresh(); const loadTimer = setInterval(refresh, 5000); const timer = setInterval(() => setNow(Date.now()), 1000); return () => { clearInterval(loadTimer); clearInterval(timer); }; }, []);
  async function toggle(order, item) {
    await setQueueItemServed(item, !item.served, order.queuedAt);
    const nextItems = order.items.map(row => row.id === item.id ? { ...row, served: !item.served, servedAt: !item.served ? Date.now() : null } : row);
    if (nextItems.every(row => row.served) && window.confirm(`All items for pager ${order.pagerNumber} are served. Remove this order from Queue?`)) { await completeQueueOrder({ ...order, items: nextItems }); await writeAudit({ action: 'UPDATE', entityType: 'queue', entity: `Pager ${order.pagerNumber}`, entityId: order.id, staff, beforeState: { status: 'active' }, afterState: { status: 'completed' } }); }
    await refresh();
  }
  if (!open) return null;
  return <aside className="queue-panel">
    <div className="queue-panel-header"><h3>Active Queue ({orders.length})</h3><button className="btn btn-ghost btn-icon" onClick={onClose}><X size={20}/></button></div>
    <div className="queue-order-list">{orders.map(order => {
      const elapsed = now - Number(order.queuedAt || now);
      const level = elapsed >= 720000 ? 'queue-red' : elapsed >= 600000 ? 'queue-orange' : '';
      return <section key={order.id} className={`queue-order ${level}`}>
        <div className="queue-order-title"><div><span className="pager-small">PAGER {order.pagerNumber}</span><strong>{order.receiptNo}</strong></div><strong className="queue-timer">{elapsedLabel(elapsed)}</strong></div>
        {order.items.map(item => <button key={item.id} className={`queue-check ${item.served ? 'served' : ''}`} onClick={() => toggle(order, item)}>
          <span className="queue-checkbox">{item.served && <Check size={16}/>}</span><span>{item.name}{item.modifiers?.length ? ` — ${item.modifiers.map(m => m.name).join(', ')}` : ''}</span><small>{elapsedLabel(item.served ? item.durationMs : elapsed)}</small>
        </button>)}
      </section>;
    })}{orders.length === 0 && <div className="empty-state"><p>No active orders</p></div>}</div>
  </aside>;
}
