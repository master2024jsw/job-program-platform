import { Workbook } from 'exceljs';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

export async function buildExcelBuffer(
  sheetName: string,
  columns: ExcelColumn[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((row) => sheet.addRow(row));
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const obj = value as { text?: unknown; result?: unknown; hyperlink?: unknown; richText?: Array<{ text: unknown }> };
    if (Array.isArray(obj.richText)) return obj.richText.map((t) => String(t.text ?? '')).join('').trim();
    if (obj.text !== undefined) return String(obj.text).trim();
    if (obj.result !== undefined) return String(obj.result).trim();
    if (obj.hyperlink !== undefined) return String(obj.hyperlink).trim();
  }
  return String(value).trim();
}

/**
 * 엑셀 첫 행을 헤더로 읽고, headerToKey 매핑에 있는 컬럼만 { key: value } 형태로 뽑아낸다.
 * sheetSelector로 시트 이름 또는 인덱스를 지정할 수 있다 (기본값: 첫 번째 시트).
 */
export async function readExcelRows(
  buffer: Buffer,
  headerToKey: Record<string, string>,
  sheetSelector?: string | number,
): Promise<Array<Record<string, string>>> {
  const workbook = new Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet =
    typeof sheetSelector === 'string'
      ? workbook.getWorksheet(sheetSelector)
      : workbook.worksheets[sheetSelector ?? 0];
  if (!sheet) return [];

  const columnIndexToKey = new Map<number, string>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const header = cellToText(cell.value);
    const key = headerToKey[header];
    if (key) columnIndexToKey.set(colNumber, key);
  });

  const rows: Array<Record<string, string>> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    let hasValue = false;
    columnIndexToKey.forEach((key, colNumber) => {
      const text = cellToText(row.getCell(colNumber).value);
      if (text) hasValue = true;
      record[key] = text;
    });
    if (hasValue) rows.push(record);
  });
  return rows;
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportSummary {
  created: number;
  updated: number;
  errors: ImportRowError[];
}
