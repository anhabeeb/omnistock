import * as XLSX from 'xlsx';

export function exportToCSV(data: any[], filename: string, columns: { header: string, key: string | ((row: any) => string | number) }[]) {
  if (!data || data.length === 0) return;

  const escapeCSV = (value: any) => {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const headers = columns.map(c => escapeCSV(c.header)).join(',');
  
  const rows = data.map(row => {
    return columns.map(c => {
      let value: any = '';
      if (typeof c.key === 'function') {
        value = c.key(row);
      } else {
        value = row[c.key];
      }
      return escapeCSV(value);
    }).join(',');
  });

  const csvContent = [headers, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToExcel(data: any[], filename: string, columns: { header: string, key: string | ((row: any) => string | number) }[]) {
  if (!data || data.length === 0) return;

  const formattedData = data.map(row => {
    const newRow: Record<string, any> = {};
    columns.forEach(c => {
      if (typeof c.key === 'function') {
        newRow[c.header] = c.key(row);
      } else {
        newRow[c.header] = row[c.key];
      }
    });
    return newRow;
  });

  const worksheet = XLSX.utils.json_to_sheet(formattedData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  
  // Generate buffer
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  
  // Save file
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
