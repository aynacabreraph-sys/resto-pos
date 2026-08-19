export const DISPLAY_DISCOUNT_PERCENT = 20;
export const EFFECTIVE_DISCOUNT_PERCENT = 17.86;
export const roundQuantity = value => Math.round(Number(value || 0) * 10000) / 10000;
export const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
export function profitMargin(price, cost) { const amount = Number(price || 0); return amount > 0 ? ((amount - Number(cost || 0)) / amount) * 100 : null; }
export function countGraphemes(value) { if (typeof Intl !== 'undefined' && Intl.Segmenter) return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value || '')].length; return Array.from(value || '').length; }
export function itemConfiguredPrice(item) { return Number(item.price || 0) + (item.modifiers || []).reduce((sum, modifier) => sum + Number(modifier.priceDelta || 0), 0); }
export function recipeComponentCost(links, sources, sourceField, costField) { const sourceMap = new Map(sources.map(row => [row.id, row])); return roundMoney(links.reduce((sum, link) => sum + Number(link.quantity || 0) * Number(sourceMap.get(link[sourceField])?.[costField] || 0), 0)); }
export function allocateDiscounts(items, authorizations) {
  const units = items.flatMap((item, itemIndex) => Array.from({ length: Number(item.quantity || 1) }, (_, unitIndex) => ({ itemIndex, unitIndex, productName: item.name, price: itemConfiguredPrice(item) })));
  if (authorizations.length > units.length) throw new Error('One ID can discount only one item. Remove extra IDs.');
  const ids = new Set(); authorizations.forEach(auth => { const normalized = String(auth.idNumber || '').trim().toLowerCase(); if (!normalized || ids.has(normalized)) throw new Error('Each discount ID number must be present and unique.'); if (!auth.photo) throw new Error('A photo is required for every discount ID.'); ids.add(normalized); });
  units.sort((a, b) => b.price - a.price || a.itemIndex - b.itemIndex || a.unitIndex - b.unitIndex);
  return authorizations.map((auth, index) => ({ ...auth, ...units[index], advertisedPercent: DISPLAY_DISCOUNT_PERCENT, effectivePercent: EFFECTIVE_DISCOUNT_PERCENT, discountAmount: roundMoney(units[index].price * EFFECTIVE_DISCOUNT_PERCENT / 100) }));
}
export function totalDiscount(allocations) { return roundMoney(allocations.reduce((sum, row) => sum + Number(row.discountAmount || 0), 0)); }
export function validateModifierSelections(groups, selectedIds) { const selected = new Set(selectedIds.map(Number)); return groups.every(group => { const count = group.options.filter(option => selected.has(option.id)).length; const min = group.required ? Math.max(1, Number(group.minSelections || 0)) : Number(group.minSelections || 0); return count >= min && count <= Number(group.maxSelections || 1); }); }
export function nextAvailablePager(lastAssigned, occupied) { const used = new Set(occupied.map(Number)); for (let step = 1; step <= 10; step += 1) { const candidate = ((Number(lastAssigned || 0) + step - 1) % 10) + 1; if (!used.has(candidate)) return candidate; } return null; }
