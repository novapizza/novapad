// ── Table Lens: serialize the table back into the delimited text it was opened from ──
// NovaPad variant of devtool's utils/tableLensSave.ts: CSV/TSV only (no xlsx dependency),
// returns text for the editor buffer instead of a Blob.

import type { Row } from './tableLensUtils';

export type SaveFormat = 'csv' | 'tsv';

/** What we remember about the opened text so saving can match it */
export interface SaveSource {
  /** Delimiter detected when the CSV was parsed (e.g. ";" in many European exports) */
  delimiter?: string;
  /** The opened text ended with a line break */
  trailingNewline?: boolean;
  /** Rows that had more values than the header has columns — Table Lens drops the extras */
  extraFieldRows?: number;
}

/** Format implied by the file extension (unknown extensions save as CSV) */
export function getSaveFormat(fileName: string): SaveFormat {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'tsv' || ext === 'tab' ? 'tsv' : 'csv';
}

/** Warning to confirm before saving a table that can't round-trip exactly */
export function getSaveWarning(source: SaveSource): string | null {
  const n = source.extraFieldRows ?? 0;
  if (n === 0) return null;
  const rows = `${n.toLocaleString()} row${n > 1 ? 's' : ''}`;
  return `${rows} had more values than the header has columns. Table Lens can't show the extra values, so saving drops them.`;
}

/** Serialize all rows, in `columns` order, as delimited text */
export async function serializeTable(
  columns: string[],
  rows: Row[],
  format: SaveFormat,
  source: SaveSource = {},
  newline = '\r\n'
): Promise<string> {
  const Papa = await import('papaparse');
  const delimiter = format === 'tsv' ? '\t' : (source.delimiter ?? ',');
  const data = rows.map((r) => columns.map((c) => r[c] ?? ''));
  // Minimal quoting (only cells that need it) so the saved file diffs cleanly against the original
  const text = Papa.default.unparse({ fields: columns, data }, { delimiter, newline });
  return source.trailingNewline ? text + newline : text;
}
