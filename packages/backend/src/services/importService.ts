import * as XLSX from 'xlsx';

/** Parses a CSV or XLSX buffer into rows keyed by normalized (snake_case) header names. */
export function parseSpreadsheet(buffer: Buffer): Record<string, string>[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  return rows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[normalizeHeader(key)] = String(value ?? '').trim();
    }
    return normalized;
  });
}

/** Parses a CSV or XLSX buffer into plain rows of cell strings, with no assumption about a header row. */
export function parseSpreadsheetRaw(buffer: Buffer): string[][] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  return rows.map((row) => row.map((cell) => String(cell ?? '').trim()));
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Returns the first non-empty value among candidate normalized header names. */
export function pickField(row: Record<string, string>, candidates: string[]): string {
  for (const candidate of candidates) {
    if (row[candidate]) return row[candidate];
  }
  return '';
}
