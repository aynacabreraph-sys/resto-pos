import React from 'react';
import { formatCurrency } from '../../utils/formatters';

export default function ProductGrid({ products, category, subCategory, searchQuery, onAdd }) {
  const filtered = products.filter(p => {
    if (category && category !== 'All' && p.category !== category) return false;
    if (subCategory && subCategory !== 'All' && p.subCategory !== subCategory) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="product-grid">
      {filtered.map(p => (
        <button type="button" key={p.id} className={`product-card ${!p.isAvailable ? 'unavailable' : ''}`} disabled={!p.isAvailable} onClick={() => p.isAvailable && onAdd(p)}>
          <div className="product-emoji">{p.emoji || '☕'}</div>
          <div className="product-name">{p.name}</div>
          <div className="product-price">{formatCurrency(p.price)}</div>
          {!p.isAvailable && <span className="badge badge-danger" style={{ position: 'absolute', top: 8, right: 8 }}>Off</span>}
        </button>
      ))}
      {filtered.length === 0 && <div className="empty-state"><p>No products found</p></div>}
    </div>
  );
}
