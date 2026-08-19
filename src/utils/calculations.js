export function calcStockValue(quantity, cost) {
  return Number(quantity || 0) * Number(cost || 0);
}

export function calcCartSubtotal(items) {
  return items.reduce((sum, item) => sum + calcItemTotal(item), 0);
}

export function calcCartTotal(items, orderDiscount = 0, orderMarkup = 0, orderDiscountAmount = 0, orderMarkupAmount = 0) {
  const subtotal = calcCartSubtotal(items);
  const percentAdjusted = subtotal * (1 - Number(orderDiscount || 0) / 100);
  return Math.max(0, percentAdjusted - Number(orderDiscountAmount || 0));
}

export function calcItemTotal(item) {
  const qty = Number(item.quantity || 1);
  if (item.configuredPrice !== undefined) return Number(item.configuredPrice || 0) * qty;
  if (Array.isArray(item.modifiers)) return (Number(item.price || 0) + item.modifiers.reduce((sum, modifier) => sum + Number(modifier.priceDelta || 0), 0)) * qty;
  return calcItemAdjustedPrice(item) * qty;
}

export function calcItemDiscountedPrice(price, discount) {
  return Number(price) * (1 - Number(discount || 0) / 100);
}

export function calcItemAdjustedPrice(price, discount = 0, markup = 0, discountAmount = 0, markupAmount = 0) {
  if (arguments.length === 1 && typeof price === 'object') {
    const item = price;
    return Number(item.customPrice || 0) > 0
      ? Number(item.customPrice)
      : calcItemAdjustedPrice(item.price, item.discount, item.markup, item.discountAmount, item.markupAmount);
  }
  const percentAdjusted = Number(price || 0) * (1 - Number(discount || 0) / 100) * (1 + Number(markup || 0) / 100);
  return Math.max(0, percentAdjusted - Number(discountAmount || 0) + Number(markupAmount || 0));
}

export function calcChange(paid, total) {
  return Math.max(0, Number(paid) - Number(total));
}

export function calcGrossProfit(transactions) {
  let revenue = 0;
  let cost = 0;
  transactions.forEach(t => {
    if (t.status === 'void') return;
    revenue += Number(t.total || 0);
    (t.items || []).forEach(item => {
      const qty = item.quantity || 1;
      cost += (item.cost || 0) * qty;
    });
  });
  return { revenue, cost, profit: revenue - cost };
}
