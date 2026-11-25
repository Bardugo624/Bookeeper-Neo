import type { AuditOut } from '@bookeeper/api';

/** Cells that a spreadsheet would run as a formula get a leading quote. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface CsvRow {
  entry: AuditOut;
  at: string;
  person: string;
  device: string;
  what: string;
}

/** CSV with CRLF lines and a byte-order mark, so Excel reads the accents. */
export function auditCsv(headers: string[], rows: CsvRow[]): string {
  const lines = [headers.map(cell).join(',')];
  for (const { entry: e, at, person, device, what } of rows) {
    lines.push(
      [String(e.id), at, person, device, e.action, what, e.entity_type ?? '', e.entity_id ?? '', e.detail ? JSON.stringify(e.detail) : '']
        .map(cell)
        .join(','),
    );
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}
