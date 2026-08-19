import React, { useMemo, useState } from 'react';
import Modal from '../common/Modal';
import { formatCurrency } from '../../utils/formatters';
import { validateModifierSelections } from '../../utils/posMath';

export default function ModifierModal({ product, groups, onConfirm, onClose }) {
  const [selected, setSelected] = useState([]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  function toggle(group, option) {
    if (group.selectionMode === 'single') setSelected(current => [...current.filter(id => !group.options.some(row => row.id === id)), option.id]);
    else setSelected(current => current.includes(option.id) ? current.filter(id => id !== option.id) : [...current, option.id]);
  }
  function confirm() {
    for (const group of groups) {
      const count = group.options.filter(option => selectedSet.has(option.id)).length;
      const min = group.required ? Math.max(1, Number(group.minSelections || 0)) : Number(group.minSelections || 0);
      if (count < min || count > Number(group.maxSelections || 1)) return;
    }
    onConfirm(selected);
  }
  const valid = validateModifierSelections(groups, selected);
  return <Modal title={`Customize ${product.name}`} onClose={onClose} footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!valid} onClick={confirm}>Add Item</button></>}>
    {groups.map(group => <div className="modifier-group" key={group.id}><div className="flex-between"><strong>{group.name}</strong><small>{group.required ? 'Required' : 'Optional'} · choose {group.minSelections || 0}–{group.maxSelections}</small></div>
      <div className="modifier-options">{group.options.map(option => <button key={option.id} className={`modifier-option ${selectedSet.has(option.id) ? 'selected' : ''}`} onClick={() => toggle(group, option)}><span>{option.name}</span><span>{Number(option.priceDelta) ? `+${formatCurrency(option.priceDelta)}` : 'Included'}</span></button>)}</div>
    </div>)}
  </Modal>;
}
