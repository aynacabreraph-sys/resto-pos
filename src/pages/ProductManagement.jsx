import React, { useEffect, useState } from 'react';
import { Edit2, Link as LinkIcon, Plus, Search, Trash2 } from 'lucide-react';
import db from '../db/database';
import Modal from '../components/common/Modal';
import RecipeModal from '../components/products/RecipeModal';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/common/Toast';
import { formatCurrency } from '../utils/formatters';
import { countGraphemes, profitMargin, recalculateAllProductCosts } from '../utils/costing';
import { writeAudit } from '../utils/audit';

const empty = { name: '', category: '', subCategory: '', price: '', cost: 0, isAvailable: true, emoji: '☕' };

export default function ProductManagement() {
  const [products, setProducts] = useState([]); const [categories, setCategories] = useState([]); const [subcategories, setSubcategories] = useState([]);
  const [search, setSearch] = useState(''); const [categoryFilter, setCategoryFilter] = useState('All'); const [subCategoryFilter, setSubCategoryFilter] = useState('All');
  const [editing, setEditing] = useState(null); const [recipeProduct, setRecipeProduct] = useState(null); const [form, setForm] = useState(empty); const [sort, setSort] = useState({ field: 'name', direction: 1 });
  const staff = useAuthStore(state => state.currentStaff); const toast = useToast();
  async function load() { const [rows, cats, subs] = await Promise.all([recalculateAllProductCosts(), db.categories.query({ orderBy: 'sortOrder' }), db.subcategories.query({ orderBy: 'sortOrder' })]); setProducts(rows); setCategories(cats); setSubcategories(subs); }
  useEffect(() => { load(); }, []);
  function openNew() { setForm({ ...empty, category: categories[0]?.name || '' }); setEditing('new'); }
  async function save() {
    if (!form.name.trim() || !form.category || form.price === '') return toast('Name, category, and price are required.', 'error');
    if (Number(form.price) < 0 || countGraphemes(form.emoji) > 2) return toast('Price cannot be negative and emoji is limited to two.', 'error');
    const { id: _id, ...rest } = form; const data = { ...rest, name: form.name.trim(), price: Number(form.price), cost: Number(form.cost || 0) };
    try {
      if (editing === 'new') { const id = await db.products.add(data); await writeAudit({ action: 'CREATE', entityType: 'product', entity: data.name, entityId: id, staff, afterState: data }); }
      else { const before = await db.products.get(editing); await db.products.update(editing, data); await writeAudit({ action: 'UPDATE', entityType: 'product', entity: data.name, entityId: editing, staff, beforeState: before, afterState: data }); }
      setEditing(null); await load(); toast('Product saved.');
    } catch { toast('Could not save product.', 'error'); }
  }
  async function remove(product) { if (!window.confirm(`Delete ${product.name}?`)) return; await db.productIngredients.where('productId').equals(product.id).delete(); await db.productInventory.where('productId').equals(product.id).delete(); await db.products.delete(product.id); await writeAudit({ action: 'DELETE', entityType: 'product', entity: product.name, entityId: product.id, staff, beforeState: product }); await load(); }
  const categorySubs = categoryName => subcategories.filter(row => row.categoryId === categories.find(category => category.name === categoryName)?.id);
  const filtered = products.filter(product => (!search || product.name.toLowerCase().includes(search.toLowerCase())) && (categoryFilter === 'All' || product.category === categoryFilter) && (subCategoryFilter === 'All' || product.subCategory === subCategoryFilter)).sort((a, b) => {
    const get = row => sort.field === 'margin' ? profitMargin(row.price, row.cost) ?? -Infinity : row[sort.field]; const av = get(a); const bv = get(b); return (typeof av === 'number' ? av - Number(bv || 0) : String(av || '').localeCompare(String(bv || ''))) * sort.direction;
  });
  function toggleSort(field) { setSort(current => ({ field, direction: current.field === field ? -current.direction : 1 })); }
  return <div className="animate-fade"><div className="page-header"><h2>Product Management</h2><button className="btn btn-primary" onClick={openNew}><Plus size={16}/> Add Product</button></div>
    <div className="toolbar"><div className="search-bar"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"/></div><select className="form-select" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setSubCategoryFilter('All'); }}><option>All</option>{categories.map(row => <option key={row.id}>{row.name}</option>)}</select><select className="form-select" value={subCategoryFilter} onChange={e => setSubCategoryFilter(e.target.value)}><option>All</option>{(categoryFilter === 'All' ? subcategories : categorySubs(categoryFilter)).map(row => <option key={row.id}>{row.name}</option>)}</select></div>
    <div className="table-container"><table className="data-table"><thead><tr>{[['name','Name'],['category','Category'],['subCategory','Subcategory'],['price','Price'],['cost','Calculated Cost'],['margin','Profit Margin']].map(([field,label]) => <th key={field}><button className="table-sort" onClick={() => toggleSort(field)}>{label}</button></th>)}<th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map(product => <tr key={product.id}><td><span className="product-table-emoji">{product.emoji || '☕'}</span>{product.name}</td><td>{product.category}</td><td>{product.subCategory || '—'}</td><td>{formatCurrency(product.price)}</td><td>{formatCurrency(product.cost)}</td><td>{profitMargin(product.price, product.cost) === null ? 'N/A' : `${profitMargin(product.price, product.cost).toFixed(2)}%`}</td><td><span className={`badge ${product.isAvailable ? 'badge-success' : 'badge-danger'}`}>{product.isAvailable ? 'Available' : 'Unavailable'}</span></td><td><div className="flex gap-8"><button className="btn btn-ghost btn-icon" onClick={() => setRecipeProduct(product)} title="Recipe & modifiers"><LinkIcon size={15}/></button><button className="btn btn-ghost btn-icon" onClick={() => { setForm({ ...product }); setEditing(product.id); }}><Edit2 size={15}/></button>{staff?.role === 'owner' && <button className="btn btn-ghost btn-icon" onClick={() => remove(product)}><Trash2 size={15}/></button>}</div></td></tr>)}</tbody></table></div>
    {editing !== null && <Modal title={editing === 'new' ? 'Add Product' : 'Edit Product'} onClose={() => setEditing(null)} footer={<><button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="form-row"><div className="form-group"><label>Name</label><input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></div><div className="form-group"><label>Emoji (2 max)</label><input className="form-input" value={form.emoji || ''} onChange={e => countGraphemes(e.target.value) <= 2 && setForm({ ...form, emoji: e.target.value })}/></div></div>
      <div className="form-row"><div className="form-group"><label>Category</label><select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value, subCategory: '' })}><option value="">Select</option>{categories.map(row => <option key={row.id}>{row.name}</option>)}</select></div><div className="form-group"><label>Subcategory</label><select className="form-select" value={form.subCategory || ''} onChange={e => setForm({ ...form, subCategory: e.target.value })}><option value="">Select</option>{categorySubs(form.category).map(row => <option key={row.id}>{row.name}</option>)}</select></div></div>
      <div className="form-row"><div className="form-group"><label>Price (₱)</label><input className="form-input" type="number" min="0" step=".01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}/></div><div className="form-group"><label>Calculated Recipe Cost (₱)</label><input className="form-input" value={form.cost || 0} readOnly/></div></div>
      <label className="checkbox-row"><input type="checkbox" checked={form.isAvailable} onChange={e => setForm({ ...form, isAvailable: e.target.checked })}/> Available for sale</label>
    </Modal>}
    {recipeProduct && <RecipeModal product={recipeProduct} onClose={async () => { setRecipeProduct(null); await load(); }}/>}</div>;
}
