import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import db from '../db/database';
import { usePosStore } from '../stores/posStore';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '../components/common/Toast';
import Modal from '../components/common/Modal';
import ProductGrid from '../components/pos/ProductGrid';
import CartPanel from '../components/pos/CartPanel';
import PaymentModal from '../components/pos/PaymentModal';
import ReceiptModal from '../components/pos/ReceiptModal';
import ModifierModal from '../components/pos/ModifierModal';
import DiscountModal from '../components/pos/DiscountModal';
import QueuePanel from '../components/pos/QueuePanel';
import CategoryManager from '../components/pos/CategoryManager';
import { formatCurrency, generateReceiptNo } from '../utils/formatters';
import { calculateProductCost, calculateProductCostBreakdown, loadModifierGroups, recalculateAllProductCosts, roundMoney, snapshotSelections } from '../utils/costing';
import { allocateDiscounts, itemConfiguredPrice, totalDiscount } from '../utils/discounts';
import { activateQueue, cancelPager, markPagerHanded, reservePager } from '../utils/orderQueue';
import { adjustIngredientStock } from '../utils/stockAdjustments';
import { recordIngredientMovement, updateDailySalesSummary } from '../utils/durability';
import { writeAudit } from '../utils/audit';

export default function PointOfSale() {
  const [products, setProducts] = useState([]); const [categories, setCategories] = useState([]); const [subcategories, setSubcategories] = useState([]);
  const [category, setCategory] = useState('All'); const [subCategory, setSubCategory] = useState('All'); const [search, setSearch] = useState('');
  const [customizing, setCustomizing] = useState(null); const [discountOpen, setDiscountOpen] = useState(false); const [authorizations, setAuthorizations] = useState([]);
  const [reservation, setReservation] = useState(null); const [pagerConfirm, setPagerConfirm] = useState(false); const [showPayment, setShowPayment] = useState(false); const [processing, setProcessing] = useState(false);
  const [handoff, setHandoff] = useState(null); const [receipt, setReceipt] = useState(null); const [queueOpen, setQueueOpen] = useState(false); const [queueCount, setQueueCount] = useState(0); const [categoryManager, setCategoryManager] = useState(false);
  const lock = useRef(false); const { cart, orderType, addItem, clearCart } = usePosStore(); const staff = useAuthStore(state => state.currentStaff); const toast = useToast();

  async function load() {
    try {
      const [productRows, categoryRows, subcategoryRows] = await Promise.all([recalculateAllProductCosts(), db.categories.query({ filters: [{ field: 'active', op: 'eq', value: true }], orderBy: 'sortOrder' }), db.subcategories.query({ filters: [{ field: 'active', op: 'eq', value: true }], orderBy: 'sortOrder' })]);
      setProducts(productRows); setCategories(categoryRows); setSubcategories(subcategoryRows);
    } catch (error) { console.error(error); toast('The POS operations database migration must be applied.', 'error'); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { const max = cart.reduce((sum, item) => sum + item.quantity, 0); if (authorizations.length > max) setAuthorizations(rows => rows.slice(0, max)); }, [cart]);

  const allocations = useMemo(() => { try { return allocateDiscounts(cart, authorizations); } catch { return []; } }, [cart, authorizations]);
  const discountTotal = totalDiscount(allocations);
  const subtotal = cart.reduce((sum, item) => sum + itemConfiguredPrice(item) * item.quantity, 0);
  const total = Math.max(0, subtotal - discountTotal);
  const visibleSubs = category === 'All' ? [] : subcategories.filter(row => row.categoryId === categories.find(c => c.name === category)?.id);

  async function chooseProduct(product) {
    const groups = await loadModifierGroups(product.id);
    if (!groups.length) addItem({ ...product, cost: await calculateProductCost(product.id) }, []);
    else setCustomizing({ product: { ...product, cost: await calculateProductCost(product.id) }, groups });
  }
  async function addCustomized(selectedIds) {
    const modifiers = await snapshotSelections(customizing.groups, selectedIds);
    addItem(customizing.product, modifiers); setCustomizing(null);
  }
  function checkoutKey() { return window.crypto?.randomUUID?.() || `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  async function beginCheckout() {
    if (!cart.length) return;
    try {
      const currentAllocations = allocateDiscounts(cart, authorizations);
      if (currentAllocations.length !== authorizations.length) throw new Error('Discount evidence is incomplete.');
      const key = checkoutKey(); const next = await reservePager(key, staff); setReservation(next); setPagerConfirm(true);
    } catch (error) { toast(error.message || 'Could not reserve a pager.', 'error'); }
  }
  async function cancelReservation() { if (reservation) await cancelPager(reservation.checkoutKey); setReservation(null); setPagerConfirm(false); }

  async function deductRecipe(item, transactionId, receiptNo) {
    const ingredientLinks = await db.productIngredients.where('productId').equals(item.productId).toArray();
    const inventoryLinks = await db.productInventory.where('productId').equals(item.productId).toArray();
    for (const modifier of item.modifiers || []) {
      ingredientLinks.push(...await db.modifierOptionIngredients.where('optionId').equals(modifier.id).toArray());
      inventoryLinks.push(...await db.modifierOptionInventory.where('optionId').equals(modifier.id).toArray());
    }
    for (const link of ingredientLinks) {
      const ingredient = await db.ingredients.get(link.ingredientId); if (!ingredient) continue;
      const quantity = Number(link.quantity) * Number(item.quantity); const { beforeStock, afterStock } = await adjustIngredientStock(ingredient, -quantity);
      await recordIngredientMovement({ ingredient, ingredientId: ingredient.id, transactionId, receiptNo, type: 'DEDUCT', quantity, beforeStock, afterStock, staff, productName: item.name });
      await writeAudit({ action: 'DEDUCT', entityType: 'ingredient', entity: ingredient.name, entityId: ingredient.id, staff, beforeState: { inStock: beforeStock, unit: ingredient.unit }, afterState: { inStock: afterStock, unit: ingredient.unit }, details: `${quantity}${ingredient.unit} used for ${item.quantity} × ${item.name}; Stock: ${beforeStock}${ingredient.unit} → ${afterStock}${ingredient.unit}` });
    }
    for (const link of inventoryLinks) {
      const inventory = await db.inventory.get(link.inventoryId); if (!inventory) continue;
      await db.inventory.update(inventory.id, { inStock: Math.max(0, Number(inventory.inStock) - Number(link.quantity) * Number(item.quantity)) });
    }
  }

  async function handlePayment(payment) {
    if (lock.current) return; lock.current = true; setProcessing(true);
    let transactionId = null;
    try {
      const freshItems = [];
      for (const item of cart) {
        const breakdown = await calculateProductCostBreakdown(item.productId); const modifierCost = (item.modifiers || []).reduce((sum, row) => sum + Number(row.cost || 0), 0);
        freshItems.push({ ...item, materialCost: breakdown.materialCost, directLaborCost: breakdown.directLaborCost, modifierCost: roundMoney(modifierCost), baseCost: breakdown.total, cost: roundMoney(breakdown.total + modifierCost), configuredPrice: itemConfiguredPrice(item), note: (item.note || '').trim(), discountAllocations: allocations.filter(row => row.itemIndex === freshItems.length).map(({ unitIndex, type, idNumber, discountAmount }) => ({ unitIndex, type, idNumber, discountAmount })) });
      }
      const receiptNo = generateReceiptNo();
      const transaction = { receiptNo, checkoutKey: reservation.checkoutKey, datetime: Date.now(), orderType, items: freshItems, paymentMethod: payment.method, paymentLines: [{ method: payment.method, amount: total }], subtotal, discountTotal, discountAuthorizationCount: allocations.length, total, cashReceived: payment.cashReceived, paymentEvidencePhoto: payment.paymentEvidencePhoto, paymentEvidenceRequired: Boolean(payment.paymentEvidenceRequired), staffId: staff?.id, staffName: staff?.name, status: 'completed' };
      transactionId = await db.transactions.add(transaction); const saved = { ...transaction, id: transactionId };
      await writeAudit({ action: 'CREATE', entityType: 'transaction', entity: receiptNo, entityId: transactionId, staff, afterState: { receiptNo, paymentMethod: payment.method, paymentEvidenceRequired: Boolean(payment.paymentEvidenceRequired), paymentEvidencePresent: Boolean(payment.paymentEvidencePhoto), total, status: 'completed' } });
      if (allocations.length) await db.discountAuthorizations.bulkAdd(allocations.map(row => ({ transactionId, receiptNo, type: row.type, idNumber: row.idNumber, photo: row.photo, itemIndex: row.itemIndex, unitIndex: row.unitIndex, productName: row.productName, advertisedPercent: row.advertisedPercent, effectivePercent: row.effectivePercent, discountAmount: row.discountAmount, staffId: staff?.id, staffName: staff?.name, createdAt: Date.now() })));
      for (const item of freshItems) await deductRecipe(item, transactionId, receiptNo);
      await updateDailySalesSummary(saved);
      const queue = await activateQueue({ reservation, transaction: saved, items: freshItems, staff });
      await writeAudit({ action: 'CREATE', entityType: 'queue', entity: `Pager ${reservation.pagerNumber}`, entityId: queue.id, staff, afterState: { receiptNo, pagerNumber: reservation.pagerNumber, status: 'active' } });
      setShowPayment(false); setReservation(null); setAuthorizations([]); clearCart(); setHandoff({ queue, transaction: saved }); toast('Payment completed and order added to Queue.', 'success');
    } catch (error) {
      console.error(error); if (!transactionId && reservation) await cancelPager(reservation.checkoutKey); toast(error.message || 'Checkout failed.', 'error');
    } finally { lock.current = false; setProcessing(false); }
  }
  async function confirmHandoff() { await markPagerHanded(handoff.queue.id); setReceipt(handoff.transaction); setHandoff(null); setQueueCount(count => count + 1); setQueueOpen(true); }

  return <div className="pos-layout">
    <main className="pos-menu"><div className="pos-toolbar"><div className="tabs"><button className={`tab ${category === 'All' ? 'active' : ''}`} onClick={() => { setCategory('All'); setSubCategory('All'); }}>All</button>{categories.map(row => <button key={row.id} className={`tab ${category === row.name ? 'active' : ''}`} onClick={() => { setCategory(row.name); setSubCategory('All'); }}>{row.name}</button>)}</div><div className="search-bar"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"/></div>{staff?.role === 'owner' && <button className="btn btn-secondary btn-sm" onClick={() => setCategoryManager(true)}>Manage Categories</button>}</div>
      {visibleSubs.length > 0 && <div className="tabs subcategory-tabs"><button className={`tab ${subCategory === 'All' ? 'active' : ''}`} onClick={() => setSubCategory('All')}>All</button>{visibleSubs.map(row => <button key={row.id} className={`tab ${subCategory === row.name ? 'active' : ''}`} onClick={() => setSubCategory(row.name)}>{row.name}</button>)}</div>}
      <ProductGrid products={products} category={category} subCategory={subCategory} searchQuery={search} onAdd={chooseProduct}/>
    </main>
    <CartPanel discountTotal={discountTotal} discountCount={authorizations.length} onDiscount={() => setDiscountOpen(true)} onCheckout={beginCheckout} checkoutDisabled={processing || pagerConfirm || showPayment} queueOpen={queueOpen} queueCount={queueCount} onToggleQueue={() => setQueueOpen(open => !open)}/>
    <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} onCountChange={setQueueCount}/>
    {customizing && <ModifierModal {...customizing} onConfirm={addCustomized} onClose={() => setCustomizing(null)}/>}
    {discountOpen && <DiscountModal authorizations={authorizations} onChange={setAuthorizations} maxCount={cart.reduce((sum, item) => sum + item.quantity, 0)} onClose={() => setDiscountOpen(false)}/>}
    {categoryManager && <CategoryManager categories={categories} subcategories={subcategories} onChanged={load} onClose={() => setCategoryManager(false)}/>}
    {pagerConfirm && <Modal title="Pager Assignment" onClose={cancelReservation} footer={<><button className="btn btn-secondary btn-lg" onClick={cancelReservation}>Cancel</button><button className="btn btn-primary btn-lg" onClick={() => { setPagerConfirm(false); setShowPayment(true); }}>OK — Use Pager {reservation?.pagerNumber}</button></>}><div className="pager-confirm"><small>GIVE THIS PAGER TO THE CUSTOMER</small><strong>{reservation?.pagerNumber}</strong><p>Confirm the pager before taking payment.</p></div></Modal>}
    {showPayment && <PaymentModal total={total} onConfirm={handlePayment} onClose={async () => { if (!processing) { setShowPayment(false); await cancelReservation(); } }} isProcessing={processing}/>}
    {handoff && <Modal title="Pager Handoff Required" onClose={() => {}} footer={<button className="btn btn-primary btn-handoff" onClick={confirmHandoff}>YES — PAGER {handoff.queue.pagerNumber} WAS GIVEN</button>}><div className="pager-confirm handoff"><small>DID YOU GIVE THE PAGER TO THE CUSTOMER?</small><strong>{handoff.queue.pagerNumber}</strong><p>This screen stays open until handoff is confirmed.</p></div></Modal>}
    {receipt && <ReceiptModal transaction={receipt} onClose={() => setReceipt(null)}/>}
  </div>;
}
