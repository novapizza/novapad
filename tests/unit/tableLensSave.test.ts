import { describe, it, expect } from 'vitest';
import { getSaveFormat, getSaveWarning, serializeTable } from '../../src/renderer/src/utils/tableLensSave';

const columns = ['id', 'name', 'note'];
const rows = [
  { id: '1', name: 'Alice', note: 'plain' },
  { id: '007', name: 'Bob, Jr.', note: 'line 1\nline 2' },
];

describe('getSaveFormat', () => {
  it('maps extensions to formats', () => {
    expect(getSaveFormat('data.csv')).toBe('csv');
    expect(getSaveFormat('data.TSV')).toBe('tsv');
    expect(getSaveFormat('data.tab')).toBe('tsv');
    expect(getSaveFormat('noext')).toBe('csv');
  });
});

describe('getSaveWarning', () => {
  it('warns only when rows had values beyond the header', () => {
    expect(getSaveWarning({})).toBeNull();
    expect(getSaveWarning({ extraFieldRows: 0 })).toBeNull();
    expect(getSaveWarning({ extraFieldRows: 1 })).toMatch(/^1 row had/);
    expect(getSaveWarning({ extraFieldRows: 3 })).toMatch(/^3 rows had/);
  });
});

describe('serializeTable', () => {
  it('writes CSV with quoting only where needed', async () => {
    const text = await serializeTable(columns, rows, 'csv');
    expect(text).toBe('id,name,note\r\n1,Alice,plain\r\n007,"Bob, Jr.","line 1\nline 2"');
  });

  it('keeps the original delimiter', async () => {
    const text = await serializeTable(columns, rows.slice(0, 1), 'csv', { delimiter: ';' });
    expect(text).toBe('id;name;note\r\n1;Alice;plain');
  });

  it('writes TSV', async () => {
    const text = await serializeTable(['a', 'b'], [{ a: '1', b: '2' }], 'tsv');
    expect(text).toBe('a\tb\r\n1\t2');
  });

  it('writes columns in the given order and fills missing cells', async () => {
    const text = await serializeTable(['b', 'a'], [{ a: '1' }], 'csv');
    expect(text).toBe('b,a\r\n,1');
  });

  it('uses the given line break and keeps a trailing one', async () => {
    const text = await serializeTable(['a'], [{ a: '1' }], 'csv', { trailingNewline: true }, '\n');
    expect(text).toBe('a\n1\n');
  });
});
