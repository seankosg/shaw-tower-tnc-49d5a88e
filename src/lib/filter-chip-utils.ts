import type { Table, Column } from '@tanstack/react-table';

const EMPTY_TOKEN = '__EMPTY__';

export interface ColumnFilterChip {
  id: string;
  label: string;
}

function getColumnLabel(column: Column<any, unknown> | undefined, columnId: string): string {
  if (!column) return columnId;
  const meta = column.columnDef.meta as { label?: string } | undefined;
  if (meta?.label) return meta.label;
  const header = column.columnDef.header;
  if (typeof header === 'string') return header;
  return columnId;
}

function formatValue(v: string): string {
  return v === EMPTY_TOKEN ? '(Empty)' : v;
}

/**
 * Convert a TanStack `columnFilters` entry into a human-readable chip label.
 * Returns null if the filter has no meaningful value.
 */
export function formatColumnFilterChip<TData>(
  table: Table<TData>,
  filter: { id: string; value: unknown },
): ColumnFilterChip | null {
  const column = table.getColumn(filter.id);
  const label = getColumnLabel(column, filter.id);
  const value = filter.value;

  // Multi-select (array)
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const display = value.slice(0, 3).map(formatValue).join(', ');
    const more = value.length > 3 ? ` +${value.length - 3} more` : '';
    return { id: filter.id, label: `${label}: ${display}${more}` };
  }

  // Object-shape filters
  if (value && typeof value === 'object') {
    const v = value as {
      text?: string;
      from?: string;
      to?: string;
      min?: number;
      max?: number;
      emptyOnly?: boolean;
    };

    // empty-only flag (text / date / progress / number)
    if (
      v.emptyOnly &&
      !v.text &&
      !v.from &&
      !v.to &&
      v.min == null &&
      v.max == null
    ) {
      return { id: filter.id, label: `${label}: (empty only)` };
    }

    // number-range
    if ('min' in v || 'max' in v) {
      if (v.min != null && v.max != null) return { id: filter.id, label: `${label}: ${v.min} – ${v.max}` };
      if (v.min != null) return { id: filter.id, label: `${label}: ≥ ${v.min}` };
      if (v.max != null) return { id: filter.id, label: `${label}: ≤ ${v.max}` };
    }

    // date-range
    if ('from' in v || 'to' in v) {
      if (v.from && v.to) return { id: filter.id, label: `${label}: ${v.from} ~ ${v.to}` };
      if (v.from) return { id: filter.id, label: `${label}: ≥ ${v.from}` };
      if (v.to) return { id: filter.id, label: `${label}: ≤ ${v.to}` };
    }

    // text / progress
    if (v.text) {
      return { id: filter.id, label: `${label} contains "${v.text}"` };
    }

    return null;
  }

  // Plain string
  if (typeof value === 'string' && value.length > 0) {
    return { id: filter.id, label: `${label} contains "${value}"` };
  }

  return null;
}

export function buildColumnFilterChips<TData>(
  table: Table<TData>,
  filters: { id: string; value: unknown }[],
): ColumnFilterChip[] {
  return filters
    .map((f) => formatColumnFilterChip(table, f))
    .filter((c): c is ColumnFilterChip => c !== null);
}
