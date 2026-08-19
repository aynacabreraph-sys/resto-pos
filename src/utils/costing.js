import db from '../db/database';
import { recipeComponentCost, roundMoney } from './posMath';
export { roundMoney, roundQuantity, profitMargin, countGraphemes } from './posMath';

export async function calculateProductCost(productId) {
  const [ingredientLinks, inventoryLinks, ingredients, inventory] = await Promise.all([
    db.productIngredients.where('productId').equals(productId).toArray(),
    db.productInventory.where('productId').equals(productId).toArray(),
    db.ingredients.toArray(), db.inventory.toArray(),
  ]);
  const ingredientCost = recipeComponentCost(ingredientLinks, ingredients, 'ingredientId', 'unitCost');
  const inventoryCost = recipeComponentCost(inventoryLinks, inventory, 'inventoryId', 'cost');
  return roundMoney(ingredientCost + inventoryCost);
}

export async function recalculateProductCost(productId) {
  const cost = await calculateProductCost(productId);
  await db.products.update(productId, { cost });
  return cost;
}

export async function recalculateAllProductCosts() {
  const products = await db.products.toArray();
  await Promise.all(products.map(product => recalculateProductCost(product.id)));
  return db.products.toArray();
}

export async function loadModifierGroups(productId, activeOnly = true) {
  const groups = await db.modifierGroups.query({ filters: [{ field: 'productId', op: 'eq', value: productId }], orderBy: 'sortOrder' });
  const allOptions = await db.modifierOptions.toArray();
  return groups.filter(group => !activeOnly || group.active).map(group => ({
    ...group,
    options: allOptions.filter(option => option.groupId === group.id && (!activeOnly || option.active)).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
  }));
}

export async function calculateModifierOptionCost(optionId) {
  const [ingredientLinks, inventoryLinks, ingredients, inventory] = await Promise.all([
    db.modifierOptionIngredients.where('optionId').equals(optionId).toArray(),
    db.modifierOptionInventory.where('optionId').equals(optionId).toArray(),
    db.ingredients.toArray(), db.inventory.toArray(),
  ]);
  return roundMoney(recipeComponentCost(ingredientLinks, ingredients, 'ingredientId', 'unitCost') + recipeComponentCost(inventoryLinks, inventory, 'inventoryId', 'cost'));
}

export async function snapshotSelections(groups, selectedIds) {
  const selected = new Set(selectedIds.map(Number));
  const rows = [];
  for (const group of groups) {
    for (const option of group.options.filter(item => selected.has(item.id))) {
      rows.push({ id: option.id, groupId: group.id, groupName: group.name, name: option.name, priceDelta: Number(option.priceDelta || 0), cost: await calculateModifierOptionCost(option.id) });
    }
  }
  return rows;
}
