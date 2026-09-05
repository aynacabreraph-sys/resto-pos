import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import db from '../db/database';
import { formatCurrency } from '../utils/formatters';
import { calcGrossProfit, calcItemTotal } from '../utils/calculations';
import { getDateRangeFilters } from '../utils/durability';
import { buildPaymentTotals, PAYMENT_METHODS, paymentMethodMatches } from '../utils/payments';
import { shiftDateRange } from '../utils/dateNavigation';

const COLORS = ['#d4982a', '#f59e0b', '#34d399', '#60a5fa', '#a78bfa', '#f87171'];

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function getRangeBounds(range, customStart, customEnd, lookbackAmount, lookbackUnit) {
  const now = new Date();
  let start = new Date();
  let end = new Date(now);
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);

  if (range === 'week') start.setDate(start.getDate() - 7);
  else if (range === 'month') start.setMonth(start.getMonth() - 1);
  else if (range === 'year') start.setFullYear(start.getFullYear() - 1);
  else if (range === 'lookback') {
    const amount = Math.max(1, Number(lookbackAmount || 1));
    if (lookbackUnit === 'years') start.setFullYear(start.getFullYear() - amount);
    else if (lookbackUnit === 'months') start.setMonth(start.getMonth() - amount);
    else start.setDate(start.getDate() - amount);
  } else if (range === 'custom') {
    start = customStart ? new Date(`${customStart}T00:00:00`) : new Date(0);
    end = customEnd ? new Date(`${customEnd}T23:59:59.999`) : new Date(now);
  } else if (range === 'all') {
    start = new Date(0);
  }

  return { start, end };
}

export default function BusinessReport() {
  const [range, setRange] = useState('today');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState(toDateInputValue(new Date()));
  const [lookbackAmount, setLookbackAmount] = useState(8);
  const [lookbackUnit, setLookbackUnit] = useState('months');
  const [txns, setTxns] = useState([]);
  const [stats, setStats] = useState({ revenue: 0, cost: 0, profit: 0 });
  const [queueOrders, setQueueOrders] = useState([]);
  const [queueItems, setQueueItems] = useState([]);
  const [discountRows, setDiscountRows] = useState([]);

  useEffect(() => { load(); }, [range, customStart, customEnd, lookbackAmount, lookbackUnit]);

  async function load() {
    const { start, end } = getRangeBounds(range, customStart, customEnd, lookbackAmount, lookbackUnit);
    const [all, queue, discounts] = await Promise.all([db.transactions.queryAll({
      filters: getDateRangeFilters(start, end),
      orderBy: 'datetime',
      ascending: true,
    }), db.orderQueue.queryAll({ filters: getDateRangeFilters(start, end, 'queuedAt') }), db.discountAuthorizations.queryAll({ filters: getDateRangeFilters(start, end, 'createdAt') })]);
    const queueIds = queue.map(row => row.id);
    const queuedItems = queueIds.length ? await db.orderQueueItems.queryAll({ filters: [{ field: 'queueId', op: 'in', value: queueIds }] }) : [];
    setTxns(all);
    setQueueOrders(queue); setQueueItems(queuedItems); setDiscountRows(discounts);
    setStats(calcGrossProfit(all));
  }

  const { start, end } = getRangeBounds(range, customStart, customEnd, lookbackAmount, lookbackUnit);

  const validAll = txns.filter(t => t.status !== 'void');
  const paymentMethods = ['All', ...PAYMENT_METHODS];
  const valid = validAll.filter(t => paymentMethodMatches(t, paymentFilter));
  const filteredStats = calcGrossProfit(valid);
  const totalSales = valid.reduce((s,t) => s + (t.total || 0), 0);
  const avgTicket = valid.length ? totalSales / valid.length : 0;
  const totalItems = valid.reduce((s,t) => s + (t.items || []).reduce((a,i) => a + i.quantity, 0), 0);
  const transactionIds = new Set(valid.map(row => row.id));
  const relevantDiscounts = discountRows.filter(row => transactionIds.has(row.transactionId));
  const discountAmount = valid.reduce((sum, row) => sum + Number(row.discountTotal || 0), 0);
  const pwdCount = relevantDiscounts.filter(row => row.type === 'PWD').length;
  const seniorCount = relevantDiscounts.filter(row => row.type === 'Senior').length;
  const completedQueue = queueOrders.filter(row => row.status === 'completed' && Number(row.durationMs) >= 0);
  const durations = completedQueue.map(row => Number(row.durationMs)).sort((a, b) => a - b);
  const averageQueue = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
  const medianQueue = durations.length ? (durations[Math.floor((durations.length - 1) / 2)] + durations[Math.ceil((durations.length - 1) / 2)]) / 2 : 0;
  const durationLabel = value => `${Math.floor(value / 60000)}m ${Math.round((value % 60000) / 1000)}s`;
  const queueIds = new Set(completedQueue.map(row => row.id)); const productTimes = {};
  queueItems.filter(row => queueIds.has(row.queueId) && row.durationMs).forEach(row => { const key = row.name; productTimes[key] ||= []; productTimes[key].push(Number(row.durationMs)); });

  // Sales by category
  const catMap = {};
  valid.forEach(t => (t.items||[]).forEach(i => {
    const cat = i.category || 'Other';
    catMap[cat] = (catMap[cat] || 0) + calcItemTotal(i);
  }));
  const catQtyMap = {};
  const catCostMap = {};
  valid.forEach(t => (t.items||[]).forEach(i => {
    const cat = i.category || 'Other';
    const qty = Number(i.quantity || 1);
    catQtyMap[cat] = (catQtyMap[cat] || 0) + qty;
    catCostMap[cat] = (catCostMap[cat] || 0) + Number(i.cost || 0) * qty;
  }));
  const catData = Object.entries(catMap).map(([name, value]) => ({ name, value: Math.round(value) }));
  const tabRows = Object.entries(catMap).map(([name, grossSales]) => ({
    name,
    quantity: catQtyMap[name] || 0,
    grossSales,
    cost: catCostMap[name] || 0,
    netSales: grossSales - (catCostMap[name] || 0),
  })).sort((a, b) => b.grossSales - a.grossSales);

  // Payment breakdown
  const payRows = Object.entries(buildPaymentTotals(validAll)).map(([name, totals]) => ({ name, quantity: totals.quantity, value: totals.amount })).sort((a, b) => b.value - a.value);
  const payData = payRows.map(({ name, value }) => ({ name, value: Math.round(value) }));
  const payTotalQty = payRows.reduce((sum, row) => sum + row.quantity, 0);
  const payTotalAmount = payRows.reduce((sum, row) => sum + row.value, 0);

  // Top products
  const prodMap = {};
  valid.forEach(t => (t.items||[]).forEach(i => {
    prodMap[i.name] = (prodMap[i.name] || 0) + i.quantity;
  }));
  const topProducts = Object.entries(prodMap).map(([name, qty]) => ({ name, qty })).sort((a,b) => b.qty - a.qty).slice(0, 8);

  // Hourly sales
  const hourMap = {};
  valid.forEach(t => { const h = new Date(t.datetime).getHours(); hourMap[h] = (hourMap[h] || 0) + t.total; });
  const hourData = Array.from({length: 24}, (_, h) => ({ hour: `${h}:00`, sales: Math.round(hourMap[h] || 0) })).filter(d => d.sales > 0);

  const tooltipStyle = { contentStyle: { background: '#231f19', border: '1px solid #3a332a', borderRadius: 8, color: '#f5e6d0', fontSize: '0.8rem' } };

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Business Report</h2>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {[['today','Today'],['week','7 Days'],['month','30 Days'],['year','Last Year'],['lookback','Look Back'],['custom','Custom'],['all','All Time']].map(([k,l]) => (
            <button key={k} className={`tab ${range === k ? 'active' : ''}`} onClick={() => setRange(k)}>{l}</button>
          ))}
        </div>
      </div>

      {(range === 'lookback' || range === 'custom') && (
        <div className="toolbar">
          {range === 'lookback' && (
            <>
              <input className="form-input" style={{ width: 100 }} type="number" min="1" value={lookbackAmount} onChange={e => setLookbackAmount(e.target.value)} />
              <select className="form-select" style={{ width: 140 }} value={lookbackUnit} onChange={e => setLookbackUnit(e.target.value)}>
                <option value="days">Days ago</option>
                <option value="months">Months ago</option>
                <option value="years">Years ago</option>
              </select>
            </>
          )}
          {range === 'custom' && (
            <>
              <button className="btn btn-secondary" onClick={() => { const values = shiftDateRange(customStart || customEnd, customEnd, -1); setCustomStart(values[0]); setCustomEnd(values[1]); }}>Previous</button>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">From</label><input className="form-input" type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">To</label><input className="form-input" type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} /></div>
              <button className="btn btn-secondary" onClick={() => { const values = shiftDateRange(customStart || customEnd, customEnd, 1); setCustomStart(values[0]); setCustomEnd(values[1]); }}>Next</button>
            </>
          )}
          <span className="text-sm text-muted">Showing {start.toLocaleDateString()} to {end.toLocaleDateString()}</span>
        </div>
      )}

      <div className="toolbar">
        <span className="text-sm text-muted">Payment method:</span>
        <select className="form-select" style={{ width: 190 }} value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
          {paymentMethods.map(method => <option key={method} value={method}>{method}</option>)}
        </select>
        <span className="text-sm text-muted">{paymentFilter === 'All' ? 'Showing all settlements' : `Showing ${paymentFilter} sales only`}</span>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Total Sales</div><div className="stat-value">{formatCurrency(totalSales)}</div></div>
        <div className="stat-card"><div className="stat-label">Transactions</div><div className="stat-value">{valid.length}</div></div>
        <div className="stat-card"><div className="stat-label">Avg Ticket</div><div className="stat-value">{formatCurrency(avgTicket)}</div></div>
        <div className="stat-card"><div className="stat-label">Items Sold</div><div className="stat-value">{totalItems}</div></div>
        <div className="stat-card"><div className="stat-label">Cost of Goods</div><div className="stat-value">{formatCurrency(filteredStats.cost)}</div></div>
        <div className="stat-card"><div className="stat-label">Gross Profit</div><div className="stat-value" style={{ color: 'var(--success)' }}>{formatCurrency(filteredStats.profit)}</div></div>
        <div className="stat-card"><div className="stat-label">Total Discounts</div><div className="stat-value">{formatCurrency(discountAmount)}</div></div>
        <div className="stat-card"><div className="stat-label">Avg Queue Time</div><div className="stat-value">{durationLabel(averageQueue)}</div></div>
      </div>

      <div className="report-grid mb-16"><div className="card"><div className="card-title mb-16">PWD / Senior Discounts</div><table className="summary-table"><tbody><tr><th>Total discount</th><td>{formatCurrency(discountAmount)}</td></tr><tr><th>PWD IDs</th><td>{pwdCount}</td></tr><tr><th>Senior IDs</th><td>{seniorCount}</td></tr></tbody></table></div><div className="card"><div className="card-title mb-16">Queue Performance</div><table className="summary-table"><tbody><tr><th>Completed orders</th><td>{completedQueue.length}</td></tr><tr><th>Average</th><td>{durationLabel(averageQueue)}</td></tr><tr><th>Median</th><td>{durationLabel(medianQueue)}</td></tr><tr><th>Over 10 minutes</th><td>{durations.filter(value => value >= 600000).length}</td></tr><tr><th>Over 12 minutes</th><td>{durations.filter(value => value >= 720000).length}</td></tr>{Object.entries(productTimes).sort((a,b) => b[1].length-a[1].length).slice(0,8).map(([name, values]) => <tr key={name}><th>{name}</th><td>{durationLabel(values.reduce((sum,value) => sum+value,0)/values.length)}</td></tr>)}</tbody></table></div></div>

      <div className="report-grid">
        <div className="card report-table-card">
          <div className="card-title mb-16">Sales Information</div>
          <table className="summary-table">
            <tbody>
              <tr><th>Total Sales</th><td>{formatCurrency(totalSales)}</td></tr>
              <tr><th>Total Cost</th><td>{formatCurrency(filteredStats.cost)}</td></tr>
              <tr><th>Gross Profit</th><td>{formatCurrency(filteredStats.profit)}</td></tr>
              <tr><th>Transactions</th><td>{valid.length}</td></tr>
              <tr><th>Items Sold</th><td>{totalItems}</td></tr>
              <tr><th>Average Ticket</th><td>{formatCurrency(avgTicket)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card report-table-card">
          <div className="card-title mb-16">Total Settlement by Payment Method</div>
          <table className="data-table compact-table mobile-card-table">
            <thead><tr><th>Method</th><th>Quantity</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {payRows.map(row => (
                <tr key={row.name}><td data-label="Method">{row.name}</td><td data-label="Quantity">{row.quantity}</td><td data-label="Amount" className="text-right">{formatCurrency(row.value)}</td></tr>
              ))}
              <tr><td data-label="Method" style={{ fontWeight: 700 }}>Total Settlement</td><td data-label="Quantity" style={{ fontWeight: 700 }}>{payTotalQty}</td><td data-label="Amount" className="text-right" style={{ fontWeight: 700 }}>{formatCurrency(payTotalAmount)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card report-table-card mb-16">
        <div className="card-title mb-16">Sales by Tab</div>
        <table className="data-table compact-table mobile-card-table">
          <thead><tr><th>Tab</th><th>Quantity Sold</th><th className="text-right">Gross Sales</th><th className="text-right">Cost</th><th className="text-right">Net Sales</th></tr></thead>
          <tbody>
            {tabRows.map(row => (
              <tr key={row.name}>
                <td data-label="Tab">{row.name}</td>
                <td data-label="Quantity Sold">{row.quantity}</td>
                <td data-label="Gross Sales" className="text-right">{formatCurrency(row.grossSales)}</td>
                <td data-label="Cost" className="text-right">{formatCurrency(row.cost)}</td>
                <td data-label="Net Sales" className="text-right">{formatCurrency(row.netSales)}</td>
              </tr>
            ))}
            <tr>
              <td data-label="Tab" style={{ fontWeight: 700 }}>Total</td>
              <td data-label="Quantity Sold" style={{ fontWeight: 700 }}>{totalItems}</td>
              <td data-label="Gross Sales" className="text-right" style={{ fontWeight: 700 }}>{formatCurrency(totalSales)}</td>
              <td data-label="Cost" className="text-right" style={{ fontWeight: 700 }}>{formatCurrency(filteredStats.cost)}</td>
              <td data-label="Net Sales" className="text-right" style={{ fontWeight: 700 }}>{formatCurrency(filteredStats.profit)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-title mb-16">Hourly Sales</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourData}><XAxis dataKey="hour" tick={{ fill: '#7a6e5f', fontSize: 11 }} /><YAxis tick={{ fill: '#7a6e5f', fontSize: 11 }} /><Tooltip {...tooltipStyle} /><Bar dataKey="sales" fill="#d4982a" radius={[4,4,0,0]} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-title mb-16">Payment Methods</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart><Pie data={payData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`}>
              {payData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie><Tooltip {...tooltipStyle} /></PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-title mb-16">Top Products</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topProducts} layout="vertical"><XAxis type="number" tick={{ fill: '#7a6e5f', fontSize: 11 }} /><YAxis dataKey="name" type="category" width={120} tick={{ fill: '#b8a692', fontSize: 11 }} /><Tooltip {...tooltipStyle} /><Bar dataKey="qty" fill="#34d399" radius={[0,4,4,0]} /></BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-title mb-16">Sales by Category</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart><Pie data={catData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`}>
              {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie><Tooltip {...tooltipStyle} /></PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
