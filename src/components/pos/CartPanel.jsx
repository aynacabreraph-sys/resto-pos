import React from 'react';
import { Minus, Plus, Trash2, BadgePercent } from 'lucide-react';
import { usePosStore } from '../../stores/posStore';
import { formatCurrency } from '../../utils/formatters';
import { itemConfiguredPrice } from '../../utils/discounts';

export default function CartPanel({ discountTotal = 0, discountCount = 0, onDiscount, onCheckout, checkoutDisabled, queueOpen, queueCount, onToggleQueue }) {
  const { cart, orderType, setOrderType, removeItem, updateQuantity, setItemNote } = usePosStore();
  const subtotal = cart.reduce((sum, item) => sum + itemConfiguredPrice(item) * Number(item.quantity || 1), 0);
  const total = Math.max(0, subtotal - Number(discountTotal || 0));
  return <aside className="cart-panel">
    <div className="cart-header"><h3>Current Order</h3><span>{cart.reduce((sum, item) => sum + item.quantity, 0)} items</span></div>
    <div className="order-type-row"><div className="tabs"><button className={`tab ${orderType === 'Dine In' ? 'active' : ''}`} onClick={() => setOrderType('Dine In')}>Dine In</button><button className={`tab ${orderType === 'Takeaway' ? 'active' : ''}`} onClick={() => setOrderType('Takeaway')}>Takeaway</button><button className={`tab ${queueOpen ? 'active' : ''}`} onClick={onToggleQueue}>Queue <span className="queue-count">{queueCount}</span></button></div></div>
    <div className="cart-items">{cart.map(item => <div className="cart-item" key={item.lineKey}>
      <div className="cart-item-top"><div><strong>{item.name}</strong>{item.modifiers?.length > 0 && <div className="text-muted text-sm">{item.modifiers.map(row => row.name).join(', ')}</div>}<div>{formatCurrency(itemConfiguredPrice(item))}</div></div><button className="btn btn-ghost btn-icon" onClick={() => removeItem(item.lineKey)}><Trash2 size={15}/></button></div>
      <div className="flex-between"><div className="quantity-control"><button onClick={() => updateQuantity(item.lineKey, item.quantity - 1)}><Minus size={13}/></button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.lineKey, item.quantity + 1)}><Plus size={13}/></button></div><strong>{formatCurrency(itemConfiguredPrice(item) * item.quantity)}</strong></div>
      <input className="form-input cart-note" value={item.note || ''} onChange={e => setItemNote(item.lineKey, e.target.value)} placeholder="Preparation note"/>
    </div>)}{cart.length === 0 && <div className="empty-state"><p>Add a product to begin</p></div>}</div>
    <div className="cart-summary"><div className="flex-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
      <button className={`btn w-full ${discountCount ? 'btn-success' : 'btn-secondary'}`} disabled={!cart.length} onClick={onDiscount}><BadgePercent size={16}/> PWD / Senior 20% {discountCount ? `(${discountCount})` : ''}</button>
      {discountTotal > 0 && <div className="flex-between discount-total"><span>Total Discount</span><strong>-{formatCurrency(discountTotal)}</strong></div>}
      <div className="cart-total"><span>Total</span><span>{formatCurrency(total)}</span></div>
      <button className="btn btn-primary charge-btn" disabled={!cart.length || checkoutDisabled} onClick={onCheckout}>Add to Queue · {formatCurrency(total)}</button>
    </div>
  </aside>;
}
