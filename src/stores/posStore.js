import { create } from 'zustand';

function lineKey(productId, modifiers = []) {
  return `${productId}:${modifiers.map(row => row.id).sort((a, b) => a - b).join(',')}`;
}

export const usePosStore = create((set, get) => ({
  cart: [], orderType: 'Dine In',
  setOrderType: orderType => set({ orderType }),
  addItem: (product, modifiers = []) => {
    const key = lineKey(product.id, modifiers);
    const cart = get().cart;
    const existing = cart.find(item => item.lineKey === key);
    if (existing) set({ cart: cart.map(item => item.lineKey === key ? { ...item, quantity: item.quantity + 1 } : item) });
    else set({ cart: [...cart, { lineKey: key, productId: product.id, name: product.name, category: product.category, subCategory: product.subCategory, price: Number(product.price || 0), cost: Number(product.cost || 0), modifiers, quantity: 1, note: '' }] });
  },
  removeItem: key => set({ cart: get().cart.filter(item => item.lineKey !== key) }),
  updateQuantity: (key, quantity) => quantity <= 0 ? set({ cart: get().cart.filter(item => item.lineKey !== key) }) : set({ cart: get().cart.map(item => item.lineKey === key ? { ...item, quantity } : item) }),
  setItemNote: (key, note) => set({ cart: get().cart.map(item => item.lineKey === key ? { ...item, note } : item) }),
  clearCart: () => set({ cart: [], orderType: 'Dine In' }),
}));
