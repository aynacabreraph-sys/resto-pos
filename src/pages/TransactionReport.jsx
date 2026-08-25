import React, { useState, useEffect } from 'react';
import { Search, Ban, Trash2, Eye, Receipt, Download } from 'lucide-react';
import db from '../db/database';
import Modal from '../components/common/Modal';
import ReceiptModal from '../components/pos/ReceiptModal';
import { useToast } from '../components/common/Toast';
import { useAuthStore } from '../stores/authStore';
import { formatCurrency, formatDate, formatTime, formatDateTime } from '../utils/formatters';
import { calcItemTotal } from '../utils/calculations';
import { PAGE_SIZE, downloadJson, getDateRangeFilters, recordIngredientMovement, reverseDailySalesSummary } from '../utils/durability';
import { adjustIngredientStock } from '../utils/stockAdjustments';
import { buildPaymentTotals, formatPaymentLabel, normalizePaymentLines, paymentMethodMatches, PAYMENT_METHODS } from '../utils/payments';
import { writeAudit } from '../utils/audit';
import { shiftDateRange } from '../utils/dateNavigation';

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function getRangeBounds(range, customStart, customEnd) {
  const now = new Date();
  let start = new Date();
  let end = new Date(now);
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);

  if (range === 'yesterday') {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (range === 'week') start.setDate(start.getDate() - 7);
  else if (range === 'month') start.setMonth(start.getMonth() - 1);
  else if (range === 'custom') {
    start = customStart ? new Date(`${customStart}T00:00:00`) : new Date(0);
    end = customEnd ? new Date(`${customEnd}T23:59:59.999`) : new Date(now);
  } else if (range === 'all') {
    start = new Date(0);
  }

  return { start, end };
}

function formatAdjustment(percent, amount) {
  const parts = [];
  if (Number(percent || 0) > 0) parts.push(`${percent}%`);
  if (Number(amount || 0) > 0) parts.push(formatCurrency(amount));
  return parts.length ? parts.join(' + ') : '-';
}

function formatUnitPrice(item) {
  if (Number(item.customPrice || 0) <= 0) return formatCurrency(item.price);
  return `${formatCurrency(item.customPrice)} custom`;
}

export default function TransactionReport() {
  const [txns, setTxns] = useState([]);
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState(toDateInputValue(new Date()));
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [staffFilter, setStaffFilter] = useState('All');
  const [selected, setSelected] = useState(null);
  const [showReceipt, setShowReceipt] = useState(null);
  const [viewPaymentEvidence, setViewPaymentEvidence] = useState(null);
  const [showVoid, setShowVoid] = useState(null);
  const [page, setPage] = useState(0);
  const [voidReason, setVoidReason] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [voidError, setVoidError] = useState('');
  const currentStaff = useAuthStore(s => s.currentStaff);
  const isOwner = currentStaff?.role === 'owner';
  const toast = useToast();

  useEffect(() => { db.staff.toArray().then(setStaff); }, []);
  useEffect(() => { setPage(0); }, [range, customStart, customEnd, paymentFilter, statusFilter, staffFilter, search]);
  useEffect(() => { load(); }, [page, range, customStart, customEnd, paymentFilter, statusFilter, staffFilter]);
  async function load() {
    const { start, end } = getRangeBounds(range, customStart, customEnd);
    const filters = getDateRangeFilters(start, end);
    if (statusFilter !== 'All') filters.push({ field: 'status', op: 'eq', value: statusFilter });
    if (staffFilter !== 'All') filters.push({ field: 'staffId', op: 'eq', value: Number(staffFilter) });
    setTxns(await db.transactions.query({ filters, orderBy: 'datetime', ascending: false, limit: PAGE_SIZE, offset: page * PAGE_SIZE }));
  }
  async function openDetails(transaction) {
    const queue = await db.orderQueue.where('transactionId').equals(transaction.id).first();
    const queueItems = queue ? await db.orderQueueItems.where('queueId').equals(queue.id).toArray() : [];
    setSelected({ ...transaction, queueTiming: queue ? { ...queue, items: queueItems } : null });
  }

  async function restoreTransactionIngredients(txn, staff, reason) {
    for (const item of (txn.items || [])) {
      const links = await db.productIngredients.where('productId').equals(item.productId).toArray();
      for (const modifier of item.modifiers || []) links.push(...await db.modifierOptionIngredients.where('optionId').equals(modifier.id).toArray());
      for (const link of links) {
        const ing = await db.ingredients.get(link.ingredientId);
        if (ing) {
          const restored = link.quantity * item.quantity;
          const { beforeStock, afterStock } = await adjustIngredientStock(ing, restored);
          await db.auditLog.add({
            action: 'RESTOCK',
            entity: ing.name,
            entityId: link.ingredientId,
            staffId: staff?.id,
            staffName: staff?.name,
            datetime: Date.now(),
            details: `Restored ${restored}${ing.unit} from ${reason} ${txn.receiptNo}; stock ${beforeStock}${ing.unit} -> ${afterStock}${ing.unit}`
          });
          await recordIngredientMovement({
            ingredient: ing,
            ingredientId: link.ingredientId,
            transactionId: txn.id,
            receiptNo: txn.receiptNo,
            type: 'RESTOCK',
            quantity: restored,
            beforeStock,
            afterStock,
            staff,
            productName: item.name,
          });
        }
      }
      const inventoryLinks = await db.productInventory.where('productId').equals(item.productId).toArray();
      for (const modifier of item.modifiers || []) inventoryLinks.push(...await db.modifierOptionInventory.where('optionId').equals(modifier.id).toArray());
      for (const link of inventoryLinks) { const inventory = await db.inventory.get(link.inventoryId); if (inventory) await db.inventory.update(inventory.id, { inStock: Number(inventory.inStock || 0) + Number(link.quantity) * Number(item.quantity || 1) }); }
    }
  }

  async function handleVoid() {
    try {
      const employee = await db.staff.where('pin').equals(managerPin).first();
      if (!employee || employee.id !== currentStaff?.id) {
        setVoidError('Enter your own six-digit employee PIN.');
        return;
      }

      const txn = showVoid;
      await db.transactions.update(txn.id, { status: 'void' });
      await db.voidLog.add({
        transactionId: txn.id, receiptNo: txn.receiptNo, reason: voidReason,
        staffId: employee.id, staffName: employee.name, datetime: Date.now(),
        originalData: JSON.parse(JSON.stringify(txn)),
      });
      await reverseDailySalesSummary(txn);
      await restoreTransactionIngredients(txn, employee, 'voided');
      await writeAudit({ action: 'VOID', entityType: 'transaction', entity: txn.receiptNo, entityId: txn.id, staff: employee, beforeState: { status: txn.status }, afterState: { status: 'void' }, details: `Voided by ${employee.name}: ${voidReason}` });
      toast('Transaction voided');
      setShowVoid(null); setVoidReason(''); setManagerPin(''); setVoidError('');
      setSelected(null); load();
    } catch (error) {
      console.error('Void failed:', error);
      setVoidError('Could not void transaction. Please check the connection and try again.');
    }
  }

  async function deleteTransaction(txn) {
    if (!isOwner) return;
    if (!window.confirm(`Delete transaction ${txn.receiptNo}? This removes the record and reverses stock/report totals if it was completed.`)) return;
    try {
      if (txn.status !== 'void') {
        await reverseDailySalesSummary(txn);
        await restoreTransactionIngredients(txn, currentStaff, 'deleted transaction');
      }
      await db.voidLog.where('transactionId').equals(txn.id).delete();
      await db.transactions.delete(txn.id);
      await db.auditLog.add({
        action: 'DELETE_TRANSACTION',
        entity: txn.receiptNo,
        entityId: txn.id,
        staffId: currentStaff?.id,
        staffName: currentStaff?.name,
        datetime: Date.now(),
        details: `Deleted transaction ${txn.receiptNo}`
      });
      toast('Transaction deleted', 'info');
      setSelected(null);
      load();
    } catch (error) {
      console.error('Delete transaction failed:', error);
      toast('Could not delete transaction. Please check the connection.', 'error');
    }
  }

  const filtered = txns.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (t.receiptNo || '').toLowerCase().includes(q) ||
      (t.staffName || '').toLowerCase().includes(q) ||
      formatPaymentLabel(t).toLowerCase().includes(q) ||
      (t.items || []).some(item => (item.name || '').toLowerCase().includes(q) || (item.note || '').toLowerCase().includes(q));
  }).filter(t => paymentMethodMatches(t, paymentFilter));

  const completed = filtered.filter(t => t.status !== 'void');
  const voided = filtered.filter(t => t.status === 'void');
  const totalSales = completed.reduce((sum, t) => sum + Number(t.total || 0), 0);
  const avgTicket = completed.length ? totalSales / completed.length : 0;
  const totalDiscounts = completed.reduce((sum, transaction) => sum + Number(transaction.discountTotal || 0), 0);
  const paymentTotals = buildPaymentTotals(completed);
  const paymentOptions = ['All', ...PAYMENT_METHODS];

  function exportFiltered() {
    downloadJson(`transactions-${Date.now()}.json`, {
      exportedAt: new Date().toISOString(),
      filters: { range, customStart, customEnd, paymentFilter, statusFilter, staffFilter, search },
      transactions: filtered.map(({ paymentEvidencePhoto, ...transaction }) => ({ ...transaction, paymentEvidencePresent: Boolean(paymentEvidencePhoto) })),
    });
  }

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Transaction Report</h2>
        <button className="btn btn-secondary" onClick={exportFiltered}><Download size={16} /> Export</button>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {[['today','Today'],['yesterday','Yesterday'],['week','7 Days'],['month','30 Days'],['custom','Custom'],['all','All Time']].map(([k,l]) => (
          <button key={k} className={`tab ${range === k ? 'active' : ''}`} onClick={() => setRange(k)}>{l}</button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="toolbar">
          <button className="btn btn-secondary" onClick={() => { const values = shiftDateRange(customStart || customEnd, customEnd, -1); setCustomStart(values[0]); setCustomEnd(values[1]); }}>Previous</button>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">From</label><input className="form-input" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} /></div>
          <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">To</label><input className="form-input" type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} /></div>
          <button className="btn btn-secondary" onClick={() => { const values = shiftDateRange(customStart || customEnd, customEnd, 1); setCustomStart(values[0]); setCustomEnd(values[1]); }}>Next</button>
        </div>
      )}

      <div className="toolbar">
        <div className="search-bar"><Search size={16} /><input placeholder="Search receipt #, staff, payment..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="form-select" style={{ width: 160 }} value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
          {paymentOptions.map(method => <option key={method} value={method}>{method === 'All' ? 'All Payments' : method}</option>)}
        </select>
        <select className="form-select" style={{ width: 150 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="All">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="void">Void</option>
        </select>
        <select className="form-select" style={{ width: 180 }} value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
          <option value="All">All Staff</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="text-muted text-sm">Showing {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Filtered Sales</div><div className="stat-value">{formatCurrency(totalSales)}</div></div>
        <div className="stat-card"><div className="stat-label">Completed</div><div className="stat-value">{completed.length}</div></div>
        <div className="stat-card"><div className="stat-label">Voids</div><div className="stat-value" style={{ color: 'var(--danger)' }}>{voided.length}</div></div>
        <div className="stat-card"><div className="stat-label">Average Ticket</div><div className="stat-value">{formatCurrency(avgTicket)}</div></div>
        <div className="stat-card"><div className="stat-label">Discounts</div><div className="stat-value">{formatCurrency(totalDiscounts)}</div></div>
      </div>

      <div className="card report-table-card mb-16">
        <div className="card-title mb-16">Payment Totals</div>
        <div className="payment-total-grid">
          {Object.entries(paymentTotals).length === 0 ? (
            <span className="text-muted text-sm">No completed sales in this view.</span>
          ) : Object.entries(paymentTotals).sort((a, b) => b[1].amount - a[1].amount).map(([method, totals]) => (
            <div key={method} className="payment-total-item">
              <span>{method}</span>
              <strong>{formatCurrency(totals.amount)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Date / Time</th><th>Receipt #</th><th>Type</th><th>Items</th><th>Payment</th><th>Staff</th><th>Discount</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id}>
                <td><div>{formatDate(t.datetime)}</div><div className="text-muted text-sm">{formatTime(t.datetime)}</div></td>
                <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{t.receiptNo}</td>
                <td><span className="badge badge-neutral">{t.orderType}</span></td>
                <td className="truncate" style={{ maxWidth: 200 }}>{(t.items||[]).map(i => `${i.name}×${i.quantity}${i.note ? ` (${i.note})` : ''}`).join(', ')}</td>
                <td>{formatPaymentLabel(t)}</td>
                <td>{t.staffName || '—'}</td>
                <td>{formatCurrency(t.discountTotal || 0)}</td>
                <td style={{ fontWeight: 600 }}>{formatCurrency(t.total)}</td>
                <td>{t.status === 'void' ? <span className="void-stamp">VOID</span> : <span className="badge badge-success">Completed</span>}</td>
                <td>
                  <div className="flex gap-8">
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openDetails(t)} title="View"><Eye size={14} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowReceipt(t)} title="Receipt"><Receipt size={14} /></button>
                    {t.status !== 'void' && <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowVoid(t)} title="Void"><Ban size={14} /></button>}
                    {isOwner && <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteTransaction(t)} title="Delete"><Trash2 size={14} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</button>
        <span className="text-sm text-muted">Page {page + 1}</span>
        <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => p + 1)} disabled={txns.length < PAGE_SIZE}>Next</button>
      </div>

      {selected && (
        <Modal title={`Transaction ${selected.receiptNo}`} large onClose={() => setSelected(null)} footer={
          <>
            {isOwner && <button className="btn btn-danger" onClick={() => deleteTransaction(selected)}><Trash2 size={14} /> Delete</button>}
            {selected.status !== 'void' && <button className="btn btn-danger" onClick={() => { setShowVoid(selected); setSelected(null); }}><Ban size={14} /> Void</button>}
            <button className="btn btn-secondary" onClick={() => { setShowReceipt(selected); setSelected(null); }}>View Receipt</button>
            <button className="btn btn-primary" onClick={() => setSelected(null)}>Close</button>
          </>
        }>
          <div className="form-row mb-16">
            <div><span className="form-label">Receipt #</span><div style={{ fontWeight: 600 }}>{selected.receiptNo}</div></div>
            <div><span className="form-label">Date & Time</span><div>{formatDateTime(selected.datetime)}</div></div>
          </div>
          {selected.queueTiming && <div className="table-container mb-16"><table className="data-table"><tbody><tr><td>Pager</td><td>{selected.queueTiming.pagerNumber}</td></tr><tr><td>Queue status</td><td>{selected.queueTiming.status}</td></tr><tr><td>Preparation time</td><td>{selected.queueTiming.durationMs ? `${Math.floor(selected.queueTiming.durationMs / 60000)}m ${Math.round((selected.queueTiming.durationMs % 60000) / 1000)}s` : 'In progress'}</td></tr>{selected.queueTiming.items.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.durationMs ? `${Math.floor(item.durationMs / 60000)}m ${Math.round((item.durationMs % 60000) / 1000)}s` : 'Not served'}</td></tr>)}</tbody></table></div>}
          <div className="form-row mb-16">
            <div><span className="form-label">Order Type</span><div><span className="badge badge-neutral">{selected.orderType}</span></div></div>
            <div><span className="form-label">Payment</span><div>{formatPaymentLabel(selected)}</div></div>
          </div>
          {selected.paymentEvidencePhoto && <div className="card mb-16"><span className="form-label">Payment Receipt Evidence</span><button className="payment-evidence-preview" onClick={() => setViewPaymentEvidence(selected.paymentEvidencePhoto)}><img src={selected.paymentEvidencePhoto} alt={`${selected.paymentMethod} receipt evidence`}/><span>View captured {selected.paymentMethod} receipt</span></button></div>}
          <div className="form-row mb-16">
            <div><span className="form-label">Staff</span><div>{selected.staffName || '—'}</div></div>
            <div><span className="form-label">Status</span><div>{selected.status === 'void' ? <span className="void-stamp">VOID</span> : <span className="badge badge-success">Completed</span>}</div></div>
          </div>

          <h4 style={{ fontSize: '0.9rem', marginBottom: 8, color: 'var(--text-secondary)' }}>Items</h4>
          <div className="table-container" style={{ marginBottom: 16 }}>
            <table className="data-table">
              <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Modifiers</th><th>Unit COGS</th><th>Subtotal</th></tr></thead>
              <tbody>
                {(selected.items || []).map((item, i) => (
                  <tr key={i}>
                    <td>
                      <div>{item.name}</div>
                      {item.modifiers?.length > 0 && <div className="text-muted text-sm">{item.modifiers.map(modifier => modifier.name).join(', ')}</div>}
                      {item.note && <div className="text-muted text-sm" style={{ whiteSpace: 'pre-wrap' }}>Note: {item.note}</div>}
                    </td><td>{item.quantity}</td><td>{formatUnitPrice(item)}</td>
                    <td>{item.modifiers?.length || 0}</td>
                    <td><strong>{formatCurrency(item.cost || 0)}</strong>{item.materialCost !== undefined && <div className="text-muted text-sm">Materials {formatCurrency(item.materialCost)} · Labor {formatCurrency(item.directLaborCost || 0)} · Modifiers {formatCurrency(item.modifierCost || 0)}</div>}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(calcItemTotal(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(selected.orderDiscount > 0 || selected.orderDiscountAmount > 0) && (
            <div className="table-container" style={{ marginBottom: 16 }}>
              <table className="data-table">
                <tbody>
                  {selected.subtotal && <tr><td>Subtotal</td><td className="text-right">{formatCurrency(selected.subtotal)}</td></tr>}
                  {selected.orderDiscount > 0 && <tr><td>Order Discount</td><td className="text-right">-{selected.orderDiscount}%</td></tr>}
                  {selected.orderDiscountAmount > 0 && <tr><td>Order Discount Cash</td><td className="text-right">-{formatCurrency(selected.orderDiscountAmount)}</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {Number(selected.discountTotal || 0) > 0 && (
            <div className="table-container" style={{ marginBottom: 16 }}>
              <table className="data-table">
                <tbody>
                  <tr><td>PWD / Senior Discount ({selected.discountAuthorizationCount || 0} ID)</td><td className="text-right">-{formatCurrency(selected.discountTotal)}</td></tr>
                </tbody>
              </table>
            </div>
          )}
          <div className="flex-between" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            <span>Total</span><span>{formatCurrency(selected.total)}</span>
          </div>
        </Modal>
      )}

      {showVoid && (
        <Modal title="Void Transaction" onClose={() => { setShowVoid(null); setVoidError(''); }} footer={
          <><button className="btn btn-secondary" onClick={() => setShowVoid(null)}>Cancel</button><button className="btn btn-danger" onClick={handleVoid} disabled={!voidReason || !managerPin}>Confirm Void</button></>
        }>
          <p style={{ marginBottom: 16, fontSize: '0.9rem' }}>Voiding <strong>{showVoid.receiptNo}</strong> — {formatCurrency(showVoid.total)}</p>
          <div className="form-group"><label className="form-label">Reason for voiding *</label><input className="form-input" value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Enter reason" /></div>
          <div className="form-group"><label className="form-label">Your Employee PIN *</label><input className="form-input" type="password" inputMode="numeric" maxLength={6} value={managerPin} onChange={e => { setManagerPin(e.target.value.replace(/\D/g, '')); setVoidError(''); }} placeholder="Enter your six-digit PIN" /></div>
          {voidError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{voidError}</p>}
        </Modal>
      )}

      {showReceipt && <ReceiptModal transaction={showReceipt} onClose={() => setShowReceipt(null)} />}
      {viewPaymentEvidence && <Modal title="Payment Receipt Evidence" large onClose={() => setViewPaymentEvidence(null)} footer={<button className="btn btn-primary" onClick={() => setViewPaymentEvidence(null)}>Close</button>}><img className="payment-evidence-full" src={viewPaymentEvidence} alt="Captured payment receipt"/></Modal>}
    </div>
  );
}
