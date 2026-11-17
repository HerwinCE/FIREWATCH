/* DataTable — tableau accessible (caption, scope, tri au clavier, en-tête collant). */
import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> { key: string; label: ReactNode; render: (row: T, i: number) => ReactNode; align?: 'left' | 'right'; mono?: boolean; sortValue?: (row: T) => number | string }
export function DataTable<T>({ columns, rows, caption, maxHeight, onRowClick, rowKey }: { columns: Column<T>[]; rows: T[]; caption: string; maxHeight?: number; onRowClick?: (row: T) => void; rowKey: (row: T, i: number) => string }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows; const col = columns.find((c) => c.key === sort.key); if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => (col.sortValue!(a) > col.sortValue!(b) ? sort.dir : -sort.dir));
  }, [rows, sort, columns]);
  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{columns.map((c) => (
          <th key={c.key} scope="col" className={c.align === 'right' ? 'r' : undefined} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
            {c.sortValue ? <button onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === -1 ? 1 : -1 }))}>{c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button> : c.label}
          </th>))}</tr></thead>
        <tbody>{sorted.map((r, i) => (
          <tr key={rowKey(r, i)} className={onRowClick ? 'is-link' : undefined} tabIndex={onRowClick ? 0 : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined} onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(r); } } : undefined}>
            {columns.map((c) => <td key={c.key} className={[c.align === 'right' && 'r', c.mono && 'num'].filter(Boolean).join(' ') || undefined}>{c.render(r, i)}</td>)}
          </tr>))}</tbody>
      </table>
    </div>
  );
}
