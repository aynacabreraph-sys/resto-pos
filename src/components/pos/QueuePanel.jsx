import React, { useEffect, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { completeQueueOrder, loadActiveQueue, loadCompletedQueue, setQueueItemServed } from '../../utils/orderQueue';
import { useAuthStore } from '../../stores/authStore';
import { writeAudit } from '../../utils/audit';
import { formatDateTime } from '../../utils/formatters';
import { shiftDateValue } from '../../utils/dateNavigation';

function elapsedLabel(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function dateBounds(value) {
  return [new Date(`${value}T00:00:00`).getTime(), new Date(`${value}T23:59:59.999`).getTime()];
}

export default function QueuePanel({ open, onClose, onCountChange }) {
  const [tab, setTab] = useState('active');
  const [orders, setOrders] = useState([]);
  const [archiveDate, setArchiveDate] = useState(localDateValue());
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(Date.now());
  const staff = useAuthStore(state => state.currentStaff);

  async function refresh() {
    const active = await loadActiveQueue();
    onCountChange?.(active.length);
    if (tab === 'active') setOrders(active);
    else { const [start, end] = dateBounds(archiveDate); setOrders(await loadCompletedQueue(start, end)); }
  }
  useEffect(() => { refresh(); const loadTimer = setInterval(refresh, 5000); return () => clearInterval(loadTimer); }, [tab, archiveDate]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);

  async function toggle(order, item) {
    await setQueueItemServed(item, !item.served, order.queuedAt);
    const nextItems = order.items.map(row => row.id === item.id ? { ...row, served: !item.served, servedAt: !item.served ? Date.now() : null } : row);
    if (nextItems.every(row => row.served) && window.confirm(`All items for pager ${order.pagerNumber} are served. Remove this order from Queue?`)) {
      await completeQueueOrder({ ...order, items: nextItems });
      await writeAudit({ action: 'UPDATE', entityType: 'queue', entity: `Pager ${order.pagerNumber}`, entityId: order.id, staff, beforeState: { status: 'active' }, afterState: { status: 'completed' } });
    }
    await refresh();
  }

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return orders;
    return orders.filter(order => String(order.pagerNumber).includes(query) || String(order.receiptNo || '').toLowerCase().includes(query) || order.items.some(item => String(item.name || '').toLowerCase().includes(query)));
  }, [orders, search]);

  if (!open) return null;
  return <aside className="queue-panel">
    <div className="queue-panel-header"><div><h3>Order Queue</h3><div className="tabs queue-tabs"><button className={`tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Active</button><button className={`tab ${tab === 'completed' ? 'active' : ''}`} onClick={() => setTab('completed')}>Completed</button></div></div><button className="btn btn-ghost btn-icon" onClick={onClose}><X size={20}/></button></div>
    {tab === 'completed' && <div className="queue-archive-tools"><button className="btn btn-secondary btn-sm" onClick={() => setArchiveDate(value => shiftDateValue(value, -1))}>Previous</button><input className="form-input" type="date" value={archiveDate} onChange={event => setArchiveDate(event.target.value)}/><button className="btn btn-secondary btn-sm" onClick={() => setArchiveDate(value => shiftDateValue(value, 1))}>Next</button></div>}
    <div className="search-bar queue-search"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search pager, receipt, product…"/></div>
    <div className="queue-order-list">{visibleOrders.map(order => {
      const elapsed = now - Number(order.queuedAt || now);
      const level = tab === 'active' ? (elapsed >= 720000 ? 'queue-red' : elapsed >= 600000 ? 'queue-orange' : '') : '';
      return <section key={order.id} className={`queue-order ${level} ${tab === 'completed' ? 'queue-completed' : ''}`}>
        <div className="queue-order-title"><div><span className="pager-small">PAGER {order.pagerNumber}</span><strong>{order.receiptNo}</strong><small>{order.orderType || 'Order'} · {order.staffName || 'Unknown staff'}</small></div><strong className="queue-timer">{elapsedLabel(tab === 'active' ? elapsed : order.durationMs)}</strong></div>
        {tab === 'completed' && <div className="queue-completed-meta"><span>Completed {formatDateTime(order.completedAt)}</span><span>Handoff {order.pagerHandedAt ? formatDateTime(order.pagerHandedAt) : 'Not recorded'}</span></div>}
        {order.items.map(item => tab === 'active' ? <button key={item.id} className={`queue-check ${item.served ? 'served' : ''}`} onClick={() => toggle(order, item)}><span className="queue-checkbox">{item.served && <Check size={16}/>}</span><span>{item.name}{item.modifiers?.length ? ` — ${item.modifiers.map(modifier => modifier.name).join(', ')}` : ''}</span><small>{elapsedLabel(item.served ? item.durationMs : elapsed)}</small></button> : <div key={item.id} className="queue-archive-item"><span><Check size={14}/></span><div><strong>{item.name}</strong>{item.modifiers?.length > 0 && <small>{item.modifiers.map(modifier => modifier.name).join(', ')}</small>}</div><div><strong>{elapsedLabel(item.durationMs)}</strong><small>{item.servedAt ? formatDateTime(item.servedAt) : 'Not recorded'}</small></div></div>)}
      </section>;
    })}{visibleOrders.length === 0 && <div className="empty-state"><p>{tab === 'active' ? 'No active orders' : 'No completed orders for this date'}</p></div>}</div>
  </aside>;
}
