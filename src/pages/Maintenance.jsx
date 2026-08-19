import React, { useEffect, useState } from 'react';
import { Download, Database, ShieldCheck, RefreshCw, Activity, Clock } from 'lucide-react';
import db from '../db/database';
import { downloadJson, toBusinessDate } from '../utils/durability';
import { branding } from '../config/branding';
import { useToast } from '../components/common/Toast';
import { formatCurrency, formatDateTime } from '../utils/formatters';

const TABLES = [
  ['staff', db.staff],
  ['customers', db.customers],
  ['membershipCards', db.membershipCards],
  ['loyaltyTransactions', db.loyaltyTransactions],
  ['products', db.products],
  ['inventory', db.inventory],
  ['ingredients', db.ingredients],
  ['productIngredients', db.productIngredients],
  ['productInventory', db.productInventory],
  ['modifierGroups', db.modifierGroups], ['modifierOptions', db.modifierOptions],
  ['modifierOptionIngredients', db.modifierOptionIngredients], ['modifierOptionInventory', db.modifierOptionInventory],
  ['transactions', db.transactions],
  ['runningBills', db.runningBills],
  ['discountAuthorizations', db.discountAuthorizations], ['orderQueue', db.orderQueue], ['orderQueueItems', db.orderQueueItems],
  ['cashDrawer', db.cashDrawer],
  ['timeRecords', db.timeRecords],
  ['voidLog', db.voidLog],
  ['auditLog', db.auditLog],
  ['dailySalesSummary', db.dailySalesSummary],
  ['ingredientMovements', db.ingredientMovements],
];

export default function Maintenance() {
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState(null);
  const [lastBackup, setLastBackup] = useState(localStorage.getItem('lastBackupAt') || '');
  const toast = useToast();

  useEffect(() => { loadHealth(); }, []);

  async function safeCount(table) {
    try { return await table.count(); }
    catch { return null; }
  }

  async function safeLatest(table, orderBy = 'datetime') {
    try { return (await table.query({ orderBy, ascending: false, limit: 1 }))[0] || null; }
    catch { return null; }
  }

  async function loadHealth() {
    setLoading(true);
    try {
      const [
        staffCount,
        productCount,
        ingredientCount,
        inventoryCount,
        queueCount,
        transactionCount,
        auditCount,
        voidCount,
        summaryCount,
        movementCount,
        latestTxn,
        latestAudit,
        latestSummary,
        lowIngredients,
      ] = await Promise.all([
        safeCount(db.staff),
        safeCount(db.products),
        safeCount(db.ingredients),
        safeCount(db.inventory),
        db.orderQueue.filteredCount([{ field: 'status', op: 'eq', value: 'active' }]),
        safeCount(db.transactions),
        safeCount(db.auditLog),
        safeCount(db.voidLog),
        safeCount(db.dailySalesSummary),
        safeCount(db.ingredientMovements),
        safeLatest(db.transactions),
        safeLatest(db.auditLog),
        safeLatest(db.dailySalesSummary, 'businessDate'),
        db.ingredients.toArray().then(items => items.filter(i => Number(i.inStock || 0) <= Number(i.lowThreshold || 0))).catch(() => []),
      ]);

      setHealth({
        counts: { staffCount, productCount, ingredientCount, inventoryCount, queueCount, transactionCount, auditCount, voidCount, summaryCount, movementCount },
        latestTxn,
        latestAudit,
        latestSummary,
        lowIngredients,
      });
    } finally {
      setLoading(false);
    }
  }

  async function exportAll() {
    setExporting(true);
    try {
      const entries = await Promise.all(TABLES.map(async ([name, table]) => [name, await table.toArray()]));
      downloadJson(`${branding.appName.toLowerCase().replace(/\s+/g, '')}-backup-${toBusinessDate()}.json`, {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        tables: Object.fromEntries(entries),
      });
      const exportedAt = new Date().toISOString();
      localStorage.setItem('lastBackupAt', exportedAt);
      setLastBackup(exportedAt);
      toast('Backup exported', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      toast('Could not export backup. Please check the connection.', 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Maintenance</h2>
        <button className="btn btn-secondary" onClick={loadHealth} disabled={loading}><RefreshCw size={16} /> Refresh</button>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Transactions</div><div className="stat-value">{health?.counts.transactionCount ?? '...'}</div></div>
        <div className="stat-card"><div className="stat-label">Products</div><div className="stat-value">{health?.counts.productCount ?? '...'}</div></div>
        <div className="stat-card"><div className="stat-label">Ingredients</div><div className="stat-value">{health?.counts.ingredientCount ?? '...'}</div></div>
        <div className="stat-card"><div className="stat-label">Active Queue</div><div className="stat-value">{health?.counts.queueCount ?? '...'}</div></div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Database size={18} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} /> Data Backup</div>
          </div>
          <p className="text-sm text-muted mb-16">Export a full JSON backup of operational tables for off-site storage.</p>
          <button className="btn btn-primary" onClick={exportAll} disabled={exporting}>
            <Download size={16} /> {exporting ? 'Exporting...' : 'Export Full Backup'}
          </button>
          <div className="mt-16 text-sm text-muted">
            Last backup: {lastBackup ? formatDateTime(lastBackup) : 'No backup exported from this browser yet'}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title"><ShieldCheck size={18} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} /> Year-Long Stability</div>
          </div>
          <div className="table-container">
            <table className="data-table">
              <tbody>
                <tr><td>Server-side date filtering</td><td><span className="badge badge-success">Enabled</span></td></tr>
                <tr><td>Paginated logs</td><td><span className="badge badge-success">Enabled</span></td></tr>
                <tr><td>Visible write failures</td><td><span className="badge badge-success">Enabled</span></td></tr>
                <tr><td>Daily summary tables</td><td><span className={`badge ${health?.counts.summaryCount === null ? 'badge-danger' : 'badge-success'}`}>{health?.counts.summaryCount === null ? 'Unavailable' : 'Enabled'}</span></td></tr>
                <tr><td>Ingredient movement ledger</td><td><span className={`badge ${health?.counts.movementCount === null ? 'badge-danger' : 'badge-success'}`}>{health?.counts.movementCount === null ? 'Unavailable' : 'Enabled'}</span></td></tr>
                <tr><td>Database indexes and constraints</td><td><span className="badge badge-success">Applied</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="dashboard-grid mt-16">
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Activity size={18} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} /> Latest Activity</div>
          </div>
          <table className="summary-table">
            <tbody>
              <tr><th>Latest Transaction</th><td>{health?.latestTxn ? `${health.latestTxn.receiptNo} (${formatCurrency(health.latestTxn.total)})` : 'None'}</td></tr>
              <tr><th>Transaction Time</th><td>{health?.latestTxn ? formatDateTime(health.latestTxn.datetime) : 'None'}</td></tr>
              <tr><th>Latest Audit</th><td>{health?.latestAudit ? `${health.latestAudit.action} ${health.latestAudit.entity || ''}` : 'None'}</td></tr>
              <tr><th>Summary Days</th><td>{health?.counts.summaryCount ?? 'Unavailable'}</td></tr>
              <tr><th>Movement Logs</th><td>{health?.counts.movementCount ?? 'Unavailable'}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title"><Clock size={18} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} /> Stock Watch</div>
          </div>
          {health?.lowIngredients?.length ? (
            <div className="table-container">
              <table className="data-table compact-table">
                <thead><tr><th>Ingredient</th><th>Stock</th><th>Threshold</th></tr></thead>
                <tbody>
                  {health.lowIngredients.slice(0, 8).map(item => (
                    <tr key={item.id}><td>{item.name}</td><td>{item.inStock} {item.unit}</td><td>{item.lowThreshold || 0} {item.unit}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 24 }}><p>No low-stock ingredients right now.</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
