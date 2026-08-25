export const ACTIVE_PAYMENT_METHODS = ['Cash', 'GCash', 'Bank Transfer', 'Foodpanda'];
export const PAYMENT_METHODS = ['Cash', 'GCash', 'Bank Transfer', 'Foodpanda', 'Card', 'Grab', 'Lalamove'];
export function requiresPaymentEvidence(method) { return method === 'GCash' || method === 'Bank Transfer'; }
export function isValidCashTender(value, total) { const tendered = Number(value); return value !== '' && Number.isFinite(tendered) && tendered >= 0 && tendered >= Number(total || 0); }

export function normalizePaymentLines(transaction) {
  const lines = Array.isArray(transaction?.paymentLines) ? transaction.paymentLines : [];
  const clean = lines
    .map(line => ({ method: line.method || 'Unspecified', amount: Number(line.amount || 0) }))
    .filter(line => line.amount > 0);

  if (clean.length > 0) return clean;
  return [{
    method: transaction?.paymentMethod || 'Unspecified',
    amount: Number(transaction?.total || 0),
  }];
}

export function formatPaymentLabel(transactionOrLines) {
  const lines = Array.isArray(transactionOrLines)
    ? transactionOrLines.filter(line => line.amount === undefined || Number(line.amount || 0) > 0)
    : normalizePaymentLines(transactionOrLines);
  const methods = [...new Set(lines.map(line => line.method || 'Unspecified'))];
  return methods.join(' + ') || 'Unspecified';
}

export function paymentMethodMatches(transaction, method) {
  if (method === 'All') return true;
  return normalizePaymentLines(transaction).some(line => line.method === method);
}

export function sumPaymentMethod(transaction, method) {
  return normalizePaymentLines(transaction)
    .filter(line => line.method === method)
    .reduce((sum, line) => sum + Number(line.amount || 0), 0);
}

export function buildPaymentTotals(transactions) {
  return transactions.reduce((map, transaction) => {
    normalizePaymentLines(transaction).forEach(line => {
      if (!map[line.method]) map[line.method] = { amount: 0, quantity: 0 };
      map[line.method].amount += Number(line.amount || 0);
      map[line.method].quantity += 1;
    });
    return map;
  }, {});
}
