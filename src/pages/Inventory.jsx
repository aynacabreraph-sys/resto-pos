import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown, PackagePlus } from 'lucide-react';
import db from '../db/database';
import Modal from '../components/common/Modal';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/common/Toast';
import { formatCurrency } from '../utils/formatters';
import { calcStockValue } from '../utils/calculations';
import { recalculateAllProductCosts } from '../utils/costing';
import { writeAudit } from '../utils/audit';

const empty = { name: '', category: '', inStock: '', price: '', cost: '' };

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [restocking, setRestocking] = useState(null);
  const [restockAmount, setRestockAmount] = useState('');
  const [restockNotes, setRestockNotes] = useState('');
  const [form, setForm] = useState(empty);
  const [sortBy, setSortBy] = useState({ field: 'name', direction: 'asc' });
  const { currentStaff } = useAuthStore();
  const toast = useToast();

  useEffect(() => { load(); }, []);
  async function load() { setItems(await db.inventory.toArray()); }

  function openNew() { setForm(empty); setEditing('new'); }
  function openEdit(item) { setForm({ ...item }); setEditing(item.id); }
  function openRestock(item) { setRestocking(item); setRestockAmount(''); setRestockNotes(''); }

  async function save() {
    if (!form.name) { toast('Item name is required', 'error'); return; }
    if ([form.inStock, form.price, form.cost].some(v => Number(v || 0) < 0)) { toast('Stock, price, and cost cannot be negative', 'error'); return; }
    try {
      const data = { ...form, inStock: Number(form.inStock || 0), price: Number(form.price || 0), cost: Number(form.cost || 0) };
      if (editing === 'new') { 
        const id = await db.inventory.add(data); 
        await db.auditLog.add({ action: 'CREATE', entity: data.name, entityId: id, staffId: currentStaff?.id, staffName: currentStaff?.name, datetime: Date.now(), details: `Added with stock ${data.inStock}` });
        toast('Item added'); 
      }
      else {
        const before = await db.inventory.get(editing);
        await db.inventory.update(editing, data); 
        await writeAudit({ action: 'UPDATE', entityType: 'inventory', entity: data.name, entityId: editing, staff: currentStaff, beforeState: before, afterState: data });
        toast('Item updated'); 
      }
      await recalculateAllProductCosts(); setEditing(null); load();
    } catch {
      toast('Could not save item. Please check the connection.', 'error');
    }
  }

  async function remove(id) {
    const [baseLinks, modifierLinks] = await Promise.all([db.productInventory.where('inventoryId').equals(id).toArray(), db.modifierOptionInventory.where('inventoryId').equals(id).toArray()]);
    if (baseLinks.length || modifierLinks.length) { toast(`This inventory item is used in ${baseLinks.length + modifierLinks.length} recipe link(s). Remove those links first.`, 'error'); return; }
    if (!confirm('Delete this item?')) return;
    const item = await db.inventory.get(id);
    await db.inventory.delete(id); 
    await db.auditLog.add({ action: 'DELETE', entity: item?.name || 'Unknown', entityId: id, staffId: currentStaff?.id, staffName: currentStaff?.name, datetime: Date.now(), details: `Deleted` });
    toast('Item deleted', 'info'); load();
  }

  async function saveRestock() {
    const quantity = Number(restockAmount);
    if (!restocking) return;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast('Enter a stock quantity greater than 0', 'error');
      return;
    }

    try {
      const item = await db.inventory.get(restocking.id);
      if (!item) {
        toast('Item could not be found', 'error');
        setRestocking(null);
        return;
      }

      const beforeStock = Number(item.inStock || 0);
      const afterStock = beforeStock + quantity;
      const note = restockNotes.trim();
      await db.inventory.update(item.id, { inStock: afterStock });
      await db.auditLog.add({
        action: 'RESTOCK',
        entity: item.name,
        entityId: item.id,
        staffId: currentStaff?.id,
        staffName: currentStaff?.name,
        datetime: Date.now(),
        details: `Added ${quantity} stock from delivery${note ? ` (${note})` : ''}; stock ${beforeStock} -> ${afterStock}`,
      });
      toast('Stock added');
      setRestocking(null);
      load();
    } catch {
      toast('Could not add stock. Please check the connection.', 'error');
    }
  }

  function toggleSort(field) {
    setSortBy(current => ({
      field,
      direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  function SortIcon({ field }) {
    if (sortBy.field !== field) return <ArrowUpDown size={13} />;
    return sortBy.direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  }

  const filtered = [...items]
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const direction = sortBy.direction === 'asc' ? 1 : -1;
      const getValue = (item) => sortBy.field === 'stockValue' ? calcStockValue(item.inStock, item.cost) : item[sortBy.field] ?? '';
      const av = getValue(a);
      const bv = getValue(b);
      if (typeof av === 'number' || typeof bv === 'number') return (Number(av || 0) - Number(bv || 0)) * direction;
      return String(av).localeCompare(String(bv)) * direction;
    });
  const totalValue = filtered.reduce((s, i) => s + calcStockValue(i.inStock, i.cost), 0);

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Inventory</h2>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Add Item</button>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">Total Items</div><div className="stat-value">{items.length}</div></div>
        <div className="stat-card"><div className="stat-label">Total Stock Value</div><div className="stat-value">{formatCurrency(totalValue)}</div></div>
      </div>

      <div className="toolbar">
        <div className="search-bar"><Search size={16} /><input placeholder="Search inventory..." value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead><tr>
            <th><button className={`table-sort ${sortBy.field === 'name' ? 'active' : ''}`} onClick={() => toggleSort('name')}>Name <SortIcon field="name" /></button></th>
            <th><button className={`table-sort ${sortBy.field === 'category' ? 'active' : ''}`} onClick={() => toggleSort('category')}>Category <SortIcon field="category" /></button></th>
            <th><button className={`table-sort ${sortBy.field === 'inStock' ? 'active' : ''}`} onClick={() => toggleSort('inStock')}>In Stock <SortIcon field="inStock" /></button></th>
            <th><button className={`table-sort ${sortBy.field === 'price' ? 'active' : ''}`} onClick={() => toggleSort('price')}>Price <SortIcon field="price" /></button></th>
            <th><button className={`table-sort ${sortBy.field === 'cost' ? 'active' : ''}`} onClick={() => toggleSort('cost')}>Cost <SortIcon field="cost" /></button></th>
            <th><button className={`table-sort ${sortBy.field === 'stockValue' ? 'active' : ''}`} onClick={() => toggleSort('stockValue')}>Stock Value <SortIcon field="stockValue" /></button></th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map(item => {
              const sv = calcStockValue(item.inStock, item.cost);
              const stockClass = item.inStock <= 0 ? 'badge-danger' : item.inStock < 50 ? 'badge-warning' : 'badge-success';
              return (
                <tr key={item.id}>
                  <td style={{ fontWeight: 500 }}>{item.name}</td>
                  <td><span className="badge badge-neutral">{item.category}</span></td>
                  <td><span className={`badge ${stockClass}`}>{item.inStock}</span></td>
                  <td>{formatCurrency(item.price)}</td>
                  <td>{formatCurrency(item.cost)}</td>
                  <td>{formatCurrency(sv)}</td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openRestock(item)} title="Add Stock"><PackagePlus size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(item)}><Edit2 size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(item.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing !== null && (
        <Modal title={editing === 'new' ? 'Add Inventory Item' : 'Edit Item'} onClose={() => setEditing(null)} footer={
          <><button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>
        }>
          <div className="form-group"><label className="form-label">Product Name</label><input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></div>
          <div className="form-group"><label className="form-label">Category</label><input className="form-input" value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="e.g. Cups, Packaging" /></div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">In Stock</label><input className="form-input" type="number" step="0.0001" value={form.inStock} onChange={e => setForm({...form, inStock: e.target.value})} /></div>
            <div className="form-group"><label className="form-label">Price (₱)</label><input className="form-input" type="number" value={form.price} onChange={e => setForm({...form, price: e.target.value})} /></div>
          </div>
          <div className="form-group"><label className="form-label">Cost (₱)</label><input className="form-input" type="number" value={form.cost} onChange={e => setForm({...form, cost: e.target.value})} /></div>
        </Modal>
      )}

      {restocking && (
        <Modal title={`Add Stock: ${restocking.name}`} onClose={() => setRestocking(null)} footer={
          <><button className="btn btn-secondary" onClick={() => setRestocking(null)}>Cancel</button><button className="btn btn-primary" onClick={saveRestock}>Add Stock</button></>
        }>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 16 }}>
            <div className="stat-card"><div className="stat-label">Current</div><div className="stat-value">{Number(restocking.inStock || 0)}</div></div>
            <div className="stat-card"><div className="stat-label">Adding</div><div className="stat-value">{Number(restockAmount || 0)}</div></div>
            <div className="stat-card"><div className="stat-label">New Total</div><div className="stat-value">{Number(restocking.inStock || 0) + Number(restockAmount || 0)}</div></div>
          </div>
          <div className="form-group">
            <label className="form-label">Quantity Delivered</label>
            <input className="form-input" type="number" min="0" step="0.0001" value={restockAmount} onChange={e => setRestockAmount(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <input className="form-input" value={restockNotes} onChange={e => setRestockNotes(e.target.value)} placeholder="Supplier, delivery receipt, or batch note" />
          </div>
        </Modal>
      )}
    </div>
  );
}
