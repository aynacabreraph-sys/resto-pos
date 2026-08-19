import React, { useState, useEffect } from 'react';
import { ArrowUpCircle, ArrowDownCircle, BarChart3, CalendarDays, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import db from '../db/database';
import Modal from '../components/common/Modal';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/common/Toast';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import { sumPaymentMethod } from '../utils/payments';
import { shiftDateValue } from '../utils/dateNavigation';

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function toMonthInputValue(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function getMonthBounds(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  const start = new Date(year, month - 1, 1).getTime();
  const end = new Date(year, month, 0, 23, 59, 59, 999).getTime();
  return { start, end };
}

export default function CashManagement() {
  const [entries, setEntries] = useState([]);
  const [cashSales, setCashSales] = useState([]);
  const [monthlyEntries, setMonthlyEntries] = useState([]);
  const [showForm, setShowForm] = useState(null); // 'in' | 'out'
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [filterDate, setFilterDate] = useState(toDateInputValue(new Date()));
  const [reportMonth, setReportMonth] = useState(toMonthInputValue());
  const [reportSearch, setReportSearch] = useState('');
  const currentStaff = useAuthStore(s => s.currentStaff);
  const toast = useToast();

  useEffect(() => { load(); }, [filterDate]);
  useEffect(() => { loadMonthlyReport(); }, [reportMonth]);

  async function load() {
    const start = new Date(`${filterDate}T00:00:00`).getTime();
    const end = new Date(`${filterDate}T23:59:59.999`).getTime();
    const [drawerRows, saleRows] = await Promise.all([
      db.cashDrawer.query({
        filters: [
          { field: 'datetime', op: 'gte', value: start },
          { field: 'datetime', op: 'lte', value: end },
        ],
        orderBy: 'datetime',
        ascending: false,
      }),
      db.transactions.query({
        filters: [
          { field: 'datetime', op: 'gte', value: start },
          { field: 'datetime', op: 'lte', value: end },
          { field: 'status', op: 'eq', value: 'completed' },
        ],
        orderBy: 'datetime',
        ascending: false,
      }),
    ]);
    setEntries(drawerRows);
    setCashSales(saleRows);
  }

  async function loadMonthlyReport() {
    const { start, end } = getMonthBounds(reportMonth);
    const rows = await db.cashDrawer.query({
      filters: [
        { field: 'datetime', op: 'gte', value: start },
        { field: 'datetime', op: 'lte', value: end },
      ],
      orderBy: 'datetime',
      ascending: false,
    });
    setMonthlyEntries(rows);
  }

  async function save() {
    if (!amount || Number(amount) <= 0) return;
    await db.cashDrawer.add({
      type: showForm, amount: Number(amount), notes,
      staffId: currentStaff?.id, staffName: currentStaff?.name, datetime: Date.now(),
    });
    toast(`Cash ${showForm} recorded`);
    setShowForm(null); setAmount(''); setNotes(''); load(); loadMonthlyReport();
  }

  const totalIn = entries.filter(e => e.type === 'in').reduce((s,e) => s + e.amount, 0);
  const totalOut = entries.filter(e => e.type === 'out').reduce((s,e) => s + e.amount, 0);
  const cashSalesTotal = cashSales.reduce((sum, sale) => sum + sumPaymentMethod(sale, 'Cash'), 0);
  const expectedCash = totalIn + cashSalesTotal - totalOut;
  const reportQuery = reportSearch.trim().toLowerCase();
  const filteredMonthlyEntries = monthlyEntries.filter(entry => {
    if (!reportQuery) return true;
    return [
      entry.notes,
      entry.staffName,
      entry.type === 'in' ? 'cash in' : 'cash out',
      formatCurrency(entry.amount),
    ].some(value => String(value || '').toLowerCase().includes(reportQuery));
  });
  const monthlyIn = filteredMonthlyEntries.filter(e => e.type === 'in').reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const monthlyOut = filteredMonthlyEntries.filter(e => e.type === 'out').reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const monthlyNet = monthlyIn - monthlyOut;
  function shiftReportMonth(direction) { const [year, month] = reportMonth.split('-').map(Number); const date = new Date(year, month - 1 + direction, 1); setReportMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`); }

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Cash Drawer</h2>
        <div className="flex gap-8">
          <button className="btn btn-secondary btn-icon" onClick={() => setFilterDate(shiftDateValue(filterDate, -1))}><ChevronLeft size={16}/></button><input className="form-input" type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ width: 160 }} /><button className="btn btn-secondary btn-icon" onClick={() => setFilterDate(shiftDateValue(filterDate, 1))}><ChevronRight size={16}/></button>
          <button className="btn btn-secondary" onClick={() => setShowMonthlyReport(true)}><BarChart3 size={16} /> Monthly Reports</button>
          <button className="btn btn-success" onClick={() => setShowForm('in')}><ArrowUpCircle size={16} /> Cash In</button>
          <button className="btn btn-danger" onClick={() => setShowForm('out')}><ArrowDownCircle size={16} /> Cash Out</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Cash Sales</div><div className="stat-value" style={{ color: 'var(--success)' }}>{formatCurrency(cashSalesTotal)}</div></div>
        <div className="stat-card"><div className="stat-label">Manual Cash In</div><div className="stat-value" style={{ color: 'var(--success)' }}>{formatCurrency(totalIn)}</div></div>
        <div className="stat-card"><div className="stat-label">Manual Cash Out</div><div className="stat-value" style={{ color: 'var(--danger)' }}>{formatCurrency(totalOut)}</div></div>
        <div className="stat-card"><div className="stat-label">Expected Cash</div><div className="stat-value">{formatCurrency(expectedCash)}</div></div>
      </div>

      <div className="alert-banner alert-info mb-24">
        <span>Expected Cash = completed cash sales + manual cash in - manual cash out.</span>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Date/Time</th><th>Type</th><th>Amount</th><th>Notes</th><th>Staff</th></tr></thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id}>
                <td>{formatDateTime(e.datetime)}</td>
                <td><span className={`badge ${e.type === 'in' ? 'badge-success' : 'badge-danger'}`}>{e.type === 'in' ? 'Cash In' : 'Cash Out'}</span></td>
                <td style={{ fontWeight: 600 }}>{formatCurrency(e.amount)}</td>
                <td>{e.notes || '—'}</td>
                <td>{e.staffName || 'Unknown'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showMonthlyReport && (
        <Modal title="Monthly Cash Movement Report" large onClose={() => setShowMonthlyReport(false)} footer={
          <button className="btn btn-primary" onClick={() => setShowMonthlyReport(false)}>Done</button>
        }>
        <div style={{ marginBottom: 16 }}>
          <div>
            <p className="text-muted text-sm">Search notes like salary, supplies, delivery, or any cash drawer reason.</p>
          </div>
          <div className="toolbar" style={{ marginTop: 12 }}>
            <div className="search-bar" style={{ background: 'var(--bg-card)' }}>
              <Search size={16} />
              <input placeholder="Search notes, staff, type..." value={reportSearch} onChange={e => setReportSearch(e.target.value)} />
            </div>
            <button className="btn btn-secondary btn-icon" onClick={() => shiftReportMonth(-1)}><ChevronLeft size={16}/></button><div className="search-bar" style={{ background: 'var(--bg-card)' }}>
              <CalendarDays size={16} />
              <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
            </div><button className="btn btn-secondary btn-icon" onClick={() => shiftReportMonth(1)}><ChevronRight size={16}/></button>
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat-card"><div className="stat-label">Report Cash In</div><div className="stat-value" style={{ color: 'var(--success)' }}>{formatCurrency(monthlyIn)}</div></div>
          <div className="stat-card"><div className="stat-label">Report Cash Out</div><div className="stat-value" style={{ color: 'var(--danger)' }}>{formatCurrency(monthlyOut)}</div></div>
          <div className="stat-card"><div className="stat-label">Net Movement</div><div className="stat-value">{formatCurrency(monthlyNet)}</div></div>
          <div className="stat-card"><div className="stat-label">Matching Records</div><div className="stat-value">{filteredMonthlyEntries.length}</div></div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead><tr><th>Date/Time</th><th>Type</th><th>Amount</th><th>Notes</th><th>Staff</th></tr></thead>
            <tbody>
              {filteredMonthlyEntries.map(e => (
                <tr key={e.id}>
                  <td>{formatDateTime(e.datetime)}</td>
                  <td><span className={`badge ${e.type === 'in' ? 'badge-success' : 'badge-danger'}`}>{e.type === 'in' ? 'Cash In' : 'Cash Out'}</span></td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(e.amount)}</td>
                  <td>{e.notes || '—'}</td>
                  <td>{e.staffName || 'Unknown'}</td>
                </tr>
              ))}
              {filteredMonthlyEntries.length === 0 && (
                <tr><td colSpan={5} className="text-center text-muted" style={{ padding: 24 }}>No cash drawer records match this report.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        </Modal>
      )}

      {showForm && (
        <Modal title={showForm === 'in' ? 'Cash In' : 'Cash Out'} onClose={() => setShowForm(null)} footer={
          <><button className="btn btn-secondary" onClick={() => setShowForm(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>
        }>
          <div className="form-group"><label className="form-label">Amount (₱)</label><input className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} autoFocus /></div>
          <div className="form-group"><label className="form-label">Notes</label><input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for cash movement" /></div>
          <div className="form-group"><label className="form-label">Staff</label><div className="form-input" style={{ background: 'var(--bg-card)' }}>{currentStaff?.name || 'Not logged in'}</div></div>
        </Modal>
      )}
    </div>
  );
}
