export function aggregateRecipeLinks(links, idField, multiplier = 1) {
  return [...links.reduce((map, link) => {
    const id = Number(link[idField]);
    const quantity = Number(link.quantity || 0) * Number(multiplier || 1);
    if (Number.isFinite(id) && Number.isFinite(quantity) && quantity > 0) map.set(id, (map.get(id) || 0) + quantity);
    return map;
  }, new Map())].map(([id, quantity]) => ({ id, quantity: Math.round(quantity * 10000) / 10000 }));
}

export function createConsumptionSnapshot({ ingredientLinks, inventoryLinks, ingredients, inventory, quantity = 1 }) {
  const ingredientById = new Map(ingredients.map(row => [Number(row.id), row]));
  const inventoryById = new Map(inventory.map(row => [Number(row.id), row]));
  return {
    ingredients: aggregateRecipeLinks(ingredientLinks, 'ingredientId', quantity).map(component => {
      const row = ingredientById.get(component.id);
      if (!row) throw new Error(`Ingredient ${component.id} no longer exists.`);
      return { ...component, name: row.name, unit: row.unit };
    }),
    inventory: aggregateRecipeLinks(inventoryLinks, 'inventoryId', quantity).map(component => {
      const row = inventoryById.get(component.id);
      if (!row) throw new Error(`Inventory item ${component.id} no longer exists.`);
      return { ...component, name: row.name };
    }),
  };
}
