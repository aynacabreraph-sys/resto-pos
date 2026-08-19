import React, { useState } from 'react';
import { Banknote, Smartphone, CreditCard, Landmark, ShoppingBag } from 'lucide-react';
import Modal from '../common/Modal';
import { formatCurrency } from '../../utils/formatters';
import { calcChange } from '../../utils/calculations';

const methods = [['Cash', Banknote], ['GCash', Smartphone], ['Card', CreditCard], ['Bank Transfer', Landmark], ['Grab', ShoppingBag], ['Foodpanda', ShoppingBag]];

export default function PaymentModal({ total, onConfirm, onClose, isProcessing = false }) {
  const [method, setMethod] = useState('Cash');
  const [cashReceived, setCashReceived] = useState('');
  const tendered = method === 'Cash' ? Number(cashReceived || 0) : Number(total || 0);
  const canConfirm = !isProcessing && tendered >= Number(total || 0);
  const quickAmounts = [50, 100, 200, 500, 1000].filter(amount => amount >= total);
  return <Modal title="Payment" onClose={onClose} footer={<button className="btn btn-primary btn-lg w-full" disabled={!canConfirm} onClick={() => onConfirm({ method, cashReceived: method === 'Cash' ? tendered : null, amount: Number(total || 0) })}>{isProcessing ? 'Processing…' : 'Complete Payment'}</button>}>
    <div className="payment-methods">{methods.map(([id, Icon]) => <button key={id} className={`payment-method ${method === id ? 'selected' : ''}`} onClick={() => { setMethod(id); setCashReceived(''); }}><Icon size={24}/><span>{id}</span></button>)}</div>
    <div className="payment-due"><small>Amount Due</small><strong>{formatCurrency(total)}</strong></div>
    {method === 'Cash' && <><input className="form-input payment-cash-input" type="number" min={total} step="0.01" value={cashReceived} onChange={event => setCashReceived(event.target.value)} placeholder="Cash received" autoFocus/>
      <div className="flex gap-8 mb-16">{quickAmounts.map(amount => <button className="btn btn-secondary btn-sm" key={amount} onClick={() => setCashReceived(String(amount))}>{formatCurrency(amount)}</button>)}</div>
      {tendered > total && <div className="alert-banner alert-success"><span>Change: <strong>{formatCurrency(calcChange(tendered, total))}</strong></span></div>}</>}
  </Modal>;
}
