export function shiftDateValue(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftDateRange(start, end, direction) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const days = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1) * direction;
  return [shiftDateValue(start, days), shiftDateValue(end, days)];
}

export function rowsToCsv(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [keys.map(escape).join(','), ...rows.map(row => keys.map(key => escape(row[key])).join(','))].join('\r\n');
}

export function downloadCsv(filename, rows) {
  const blob = new Blob([rowsToCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
