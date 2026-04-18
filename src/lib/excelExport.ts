import * as XLSX from 'xlsx';
import { ExtractedInvoice } from './extractionPatterns';

function parseSignedAmount(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const compact = value
    .trim()
    .replace(/\s+/g, '')
    .replace(/−/g, '-')
    .toUpperCase();

  if (!compact) {
    return null;
  }

  const isNegative = compact.startsWith('-') || compact.endsWith('-') || (compact.includes('(') && compact.includes(')'));
  let unsigned = compact
    .replace(/RON/g, '')
    .replace(/[()\-]/g, '')

  if (unsigned.includes(',') && unsigned.includes('.')) {
    unsigned = unsigned.replace(/\./g, '').replace(',', '.');
  } else if (unsigned.includes(',')) {
    unsigned = unsigned.replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(unsigned)) {
    unsigned = unsigned.replace(/\./g, '');
  }

  const parsed = Number(unsigned);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return isNegative ? -parsed : parsed;
}

export function generateExcelFile(invoices: ExtractedInvoice[], outputFileName = 'Facturi_Extrase.xlsx'): void {
  // Prepare data with proper column order
  const data = invoices.map((invoice, index) => ({
    'NR. CRT': invoice.nrCrt || index + 1,
    'DATA': invoice.data,
    'NR. FF': invoice.nrFf,
    'DENUMIRE': invoice.denumire,
    'CIF': invoice.cif,
    'TOTAL VAL INCL. TVA': invoice.totalValInclTva,
  }));

  // Create a new workbook
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Facturi');

  // Set column widths
  const colWidths = [
    { wch: 10 },  // NR. CRT
    { wch: 15 },  // DATA
    { wch: 20 },  // NR. FF
    { wch: 30 },  // DENUMIRE
    { wch: 15 },  // CIF
    { wch: 20 },  // TOTAL VAL INCL. TVA
  ];
  worksheet['!cols'] = colWidths;

  // Generate Excel file and trigger download
  const amountColumnIndexes = [5];
  for (let rowIndex = 1; rowIndex <= invoices.length; rowIndex++) {
    for (const columnIndex of amountColumnIndexes) {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = worksheet[cellAddress];

      if (cell) {
        const numericValue = parseSignedAmount(cell.v);
        if (numericValue !== null) {
          cell.v = numericValue;
          cell.t = 'n';
          cell.z = '#,##0.00;[Red]-#,##0.00';
        }
      }
    }
  }

  XLSX.writeFile(workbook, outputFileName);
}
