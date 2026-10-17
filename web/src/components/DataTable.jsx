import { useEffect, useMemo, useRef, useState } from 'react';
import { DownloadIcon, SortIcon } from './Icons.jsx';

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'string') return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
  return a - b;
}

function csvCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return String(Math.round(value * 100) / 100).replace('.', ',');
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportCsv(filename, columns, rows) {
  const header = columns.map((c) => csvCell(c.label)).join(';');
  const lines = rows.map((row) => columns.map((c) => csvCell(c.csv ? c.csv(row) : c.value(row))).join(';'));
  const blob = new Blob([`﻿${[header, ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Tabela ordenável. Coluna: { key, label, value(row), render?(row), num?, title?, csv?(row), bar?, footer?(f) }.
 * `bar: true` desenha uma barra de fundo proporcional ao maior valor da coluna.
 */
export function DataTable({ columns, rows, defaultSort, footer, onRowClick, rowKey = (r) => r.id, empty = 'Nada para mostrar.', highlight }) {
  const [sort, setSort] = useState(defaultSort || { key: columns[0].key, dir: 'asc' });
  const highlightRef = useRef(null);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const list = [...rows].sort((a, b) => compare(col.value(a), col.value(b)));
    if (sort.dir === 'desc') {
      const filled = list.filter((r) => col.value(r) != null).reverse();
      return [...filled, ...list.filter((r) => col.value(r) == null)];
    }
    return list;
  }, [rows, columns, sort]);

  const maxima = useMemo(() => {
    const out = {};
    for (const col of columns) if (col.bar) out[col.key] = Math.max(0, ...rows.map((r) => col.value(r) || 0));
    return out;
  }, [columns, rows]);

  useEffect(() => {
    if (highlight && highlightRef.current) highlightRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlight, sorted.length]);

  function toggle(col) {
    setSort((s) => (s.key === col.key
      ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key: col.key, dir: col.num ? 'desc' : 'asc' }));
  }

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((col) => {
              const active = sort.key === col.key;
              return (
                <th key={col.key} className={`${col.num ? 'num' : ''} ${active ? 'sorted' : ''}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} title={col.title}>
                  <button type="button" onClick={() => toggle(col)}>
                    {col.label}
                    <SortIcon dir={active ? sort.dir : null} />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && <tr><td className="empty-row" colSpan={columns.length}>{empty}</td></tr>}
          {sorted.map((row) => {
            const isHighlight = highlight && rowKey(row) === highlight;
            return (
              <tr
                key={rowKey(row)}
                ref={isHighlight ? highlightRef : undefined}
                className={`${onRowClick ? 'clickable' : ''} ${isHighlight ? 'highlight' : ''}`}
                onClick={onRowClick ? (e) => { if (!e.target.closest('a,button')) onRowClick(row); } : undefined}
              >
                {columns.map((col) => {
                  const content = col.render ? col.render(row) : col.value(row);
                  const max = maxima[col.key];
                  return (
                    <td key={col.key} className={`${col.num ? 'num' : ''} ${col.className || ''}`}>
                      {col.bar && max > 0 ? (
                        <span className="cell-bar">
                          <i style={{ transform: `scaleX(${(col.value(row) || 0) / max})`, left: 0 }} />
                          <span>{content}</span>
                        </span>
                      ) : content}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        {footer && sorted.length > 0 && (
          <tfoot>
            <tr>
              {columns.map((col, i) => (
                <td key={col.key} className={col.num ? 'num' : ''}>{i === 0 ? footer.label : col.footer ? col.footer(footer) : ''}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function ExportButton({ onClick }) {
  return (
    <button type="button" className="btn btn-sm" onClick={onClick}>
      <DownloadIcon /> Exportar CSV
    </button>
  );
}
