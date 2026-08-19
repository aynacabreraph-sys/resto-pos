import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseKey);

function applyFilters(query, filters = []) {
  return filters.reduce((q, filter) => {
    const { field, op, value } = filter;
    if (op === 'eq') return q.eq(field, value);
    if (op === 'gte') return q.gte(field, value);
    if (op === 'lte') return q.lte(field, value);
    if (op === 'gt') return q.gt(field, value);
    if (op === 'lt') return q.lt(field, value);
    if (op === 'ilike') return q.ilike(field, value);
    return q;
  }, query);
}

function handleMutationError(tableName, action, error) {
  if (error) {
    console.error(`Error ${action} ${tableName}:`, error);
    throw error;
  }
}

function buildTable(tableName) {
  return {
    async toArray() {
      const { data, error } = await supabase.from(tableName).select('*');
      if (error) console.error(`Error fetching ${tableName}:`, error);
      return data || [];
    },
    async query({ select = '*', filters = [], orderBy, ascending = true, limit, offset = 0 } = {}) {
      let query = applyFilters(supabase.from(tableName).select(select), filters);
      if (orderBy) query = query.order(orderBy, { ascending });
      if (typeof limit === 'number') query = query.range(offset, offset + limit - 1);
      const { data, error } = await query;
      if (error) console.error(`Error querying ${tableName}:`, error);
      return data || [];
    },
    async add(obj) {
      // Remove id to let PostgreSQL auto-increment
      const { id, ...rest } = obj;
      const { data, error } = await supabase.from(tableName).insert([rest]).select();
      handleMutationError(tableName, 'adding to', error);
      return data?.[0]?.id;
    },
    async upsert(obj, options = {}) {
      const { data, error } = await supabase.from(tableName).upsert(obj, options).select();
      handleMutationError(tableName, 'upserting into', error);
      return data?.[0];
    },
    async update(id, obj) {
      const { error } = await supabase.from(tableName).update(obj).eq('id', id);
      handleMutationError(tableName, 'updating', error);
    },
    async delete(id) {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      handleMutationError(tableName, 'deleting from', error);
    },
    async get(id) {
      const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single();
      if (error) console.error(`Error getting from ${tableName}:`, error);
      return data;
    },
    async count() {
      const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
      if (error) console.error(`Error counting ${tableName}:`, error);
      return count || 0;
    },
    async filteredCount(filters = []) {
      const { count, error } = await applyFilters(supabase.from(tableName).select('*', { count: 'exact', head: true }), filters);
      if (error) console.error(`Error counting ${tableName}:`, error);
      return count || 0;
    },
    async bulkAdd(arr) {
      const cleanArr = arr.map(({id, ...rest}) => rest);
      const { error } = await supabase.from(tableName).insert(cleanArr);
      if (error) console.error(`Error bulk adding to ${tableName}:`, error);
    },
    where(field) {
      return {
        equals(value) {
          return {
            async first() {
              const { data, error } = await supabase.from(tableName).select('*').eq(field, value).limit(1);
              if (error) console.error(`Error where.equals.first on ${tableName}:`, error);
              return data?.[0] || null;
            },
            async toArray() {
              const { data, error } = await supabase.from(tableName).select('*').eq(field, value);
              if (error) console.error(`Error where.equals.toArray on ${tableName}:`, error);
              return data || [];
            },
            async delete() {
              const { error } = await supabase.from(tableName).delete().eq(field, value);
              handleMutationError(tableName, 'deleting from', error);
            }
          };
        },
        above(value) {
          return {
            async toArray() {
              const { data, error } = await supabase.from(tableName).select('*').gt(field, value);
              if (error) console.error(`Error where.above.toArray on ${tableName}:`, error);
              return data || [];
            }
          }
        }
      };
    }
  };
}

const db = {
  staff: buildTable('staff'),
  categories: buildTable('categories'),
  subcategories: buildTable('subcategories'),
  customers: buildTable('customers'),
  membershipCards: buildTable('membership_cards'),
  loyaltyTransactions: buildTable('loyalty_transactions'),
  products: buildTable('products'),
  inventory: buildTable('inventory'),
  ingredients: buildTable('ingredients'),
  productIngredients: buildTable('product_ingredients'),
  productInventory: buildTable('product_inventory'),
  modifierGroups: buildTable('modifier_groups'),
  modifierOptions: buildTable('modifier_options'),
  modifierOptionIngredients: buildTable('modifier_option_ingredients'),
  modifierOptionInventory: buildTable('modifier_option_inventory'),
  transactions: buildTable('transactions'),
  runningBills: buildTable('running_bills'),
  discountAuthorizations: buildTable('discount_authorizations'),
  orderQueue: buildTable('order_queue'),
  orderQueueItems: buildTable('order_queue_items'),
  dailySalesSummary: buildTable('daily_sales_summary'),
  ingredientMovements: buildTable('ingredient_movements'),
  cashDrawer: buildTable('cash_drawer'),
  timeRecords: buildTable('time_records'),
  voidLog: buildTable('void_log'),
  auditLog: buildTable('audit_log'),
  async rpc(name, params) {
    const { data, error } = await supabase.rpc(name, params);
    handleMutationError(name, 'calling rpc', error);
    return data;
  },
  
  // Dummy functions to keep existing code happy
  version() { return { stores() {} }; },
  transaction() { return null; }
};

export default db;
