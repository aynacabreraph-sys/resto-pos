import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from '../common/Modal';
import db from '../../db/database';
import { useAuthStore } from '../../stores/authStore';
import { useToast } from '../common/Toast';
import { writeAudit } from '../../utils/audit';

export default function CategoryManager({ categories, subcategories, onChanged, onClose }) {
  const [categoryName, setCategoryName] = useState(''); const [subNames, setSubNames] = useState({});
  const [action, setAction] = useState(null);
  const staff = useAuthStore(state => state.currentStaff); const toast = useToast();
  async function addCategory() { const name = categoryName.trim(); if (!name) return; try { const id = await db.categories.add({ name, sortOrder: categories.length + 1, active: true }); await writeAudit({ action: 'CREATE', entityType: 'category', entity: name, entityId: id, staff, afterState: { name } }); setCategoryName(''); await onChanged(); } catch { toast('Category name must be unique.', 'error'); } }
  function renameCategory(row) { setAction({ type: 'renameCategory', row, name: row.name, title: 'Rename Category' }); }
  async function removeCategory(row) { const products = await db.products.query({ filters: [{ field: 'category', op: 'eq', value: row.name }] }); if (products.length) return toast(`${products.length} product(s) still use ${row.name}. Reassign them first.`, 'error'); setAction({ type: 'removeCategory', row, title: 'Delete Category' }); }
  async function addSubcategory(category) { const name = (subNames[category.id] || '').trim(); if (!name) return; try { const id = await db.subcategories.add({ categoryId: category.id, name, sortOrder: subcategories.filter(row => row.categoryId === category.id).length + 1, active: true }); await writeAudit({ action: 'CREATE', entityType: 'subcategory', entity: name, entityId: id, staff, afterState: { category: category.name, name } }); setSubNames(current => ({ ...current, [category.id]: '' })); await onChanged(); } catch { toast('Subcategory name must be unique within its category.', 'error'); } }
  function renameSubcategory(row, category) { setAction({ type: 'renameSubcategory', row, category, name: row.name, title: 'Rename Subcategory' }); }
  async function removeSubcategory(row, category) { const products = await db.products.query({ filters: [{ field: 'category', op: 'eq', value: category.name }, { field: 'subCategory', op: 'eq', value: row.name }] }); if (products.length) return toast(`${products.length} product(s) still use ${row.name}. Reassign them first.`, 'error'); setAction({ type: 'removeSubcategory', row, category, title: 'Delete Subcategory' }); }
  async function confirmAction() {
    const name = action.name?.trim();
    if (action.type === 'renameCategory' && name && name !== action.row.name) { const products = await db.products.query({ filters: [{ field: 'category', op: 'eq', value: action.row.name }] }); await Promise.all(products.map(product => db.products.update(product.id, { category: name }))); await db.categories.update(action.row.id, { name }); await writeAudit({ action: 'UPDATE', entityType: 'category', entity: name, entityId: action.row.id, staff, beforeState: action.row, afterState: { ...action.row, name } }); }
    if (action.type === 'renameSubcategory' && name && name !== action.row.name) { const products = await db.products.query({ filters: [{ field: 'category', op: 'eq', value: action.category.name }, { field: 'subCategory', op: 'eq', value: action.row.name }] }); await Promise.all(products.map(product => db.products.update(product.id, { subCategory: name }))); await db.subcategories.update(action.row.id, { name }); await writeAudit({ action: 'UPDATE', entityType: 'subcategory', entity: name, entityId: action.row.id, staff, beforeState: action.row, afterState: { ...action.row, name } }); }
    if (action.type === 'removeCategory') { const children = await db.subcategories.where('categoryId').equals(action.row.id).toArray(); for (const child of children) await db.subcategories.delete(child.id); await db.categories.delete(action.row.id); await writeAudit({ action: 'DELETE', entityType: 'category', entity: action.row.name, entityId: action.row.id, staff, beforeState: action.row }); }
    if (action.type === 'removeSubcategory') { await db.subcategories.delete(action.row.id); await writeAudit({ action: 'DELETE', entityType: 'subcategory', entity: action.row.name, entityId: action.row.id, staff, beforeState: action.row }); }
    setAction(null); await onChanged();
  }
  return <Modal title="Manage POS Categories" large onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
    <div className="form-row mb-16"><input className="form-input" value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="New category"/><button className="btn btn-primary" onClick={addCategory}><Plus size={16}/> Add Category</button></div>
    <div className="category-manager">{categories.map(category => <section key={category.id}><div className="flex-between"><button className="btn btn-ghost" onClick={() => renameCategory(category)}><strong>{category.name}</strong></button><button className="btn btn-ghost btn-icon" onClick={() => removeCategory(category)}><Trash2 size={15}/></button></div>
      {subcategories.filter(row => row.categoryId === category.id).map(row => <div className="subcategory-manager-row" key={row.id}><button className="btn btn-ghost" onClick={() => renameSubcategory(row, category)}>{row.name}</button><button className="btn btn-ghost btn-icon" onClick={() => removeSubcategory(row, category)}><Trash2 size={14}/></button></div>)}
      <div className="form-row"><input className="form-input" value={subNames[category.id] || ''} onChange={e => setSubNames(current => ({ ...current, [category.id]: e.target.value }))} placeholder="New subcategory"/><button className="btn btn-secondary" onClick={() => addSubcategory(category)}><Plus size={15}/></button></div>
    </section>)}</div>
    {action && <Modal title={action.title} onClose={() => setAction(null)} footer={<><button className="btn btn-secondary" onClick={() => setAction(null)}>Cancel</button><button className={`btn ${action.type.startsWith('remove') ? 'btn-danger' : 'btn-primary'}`} onClick={confirmAction}>{action.type.startsWith('remove') ? 'Delete' : 'Save'}</button></>}>
      {action.type.startsWith('rename') ? <div className="form-group"><label className="form-label">Name</label><input className="form-input" autoFocus value={action.name} onChange={event => setAction(current => ({ ...current, name: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') confirmAction(); }}/></div> : <p>Delete <strong>{action.row.name}</strong>? This cannot be undone.</p>}
    </Modal>}
  </Modal>;
}
