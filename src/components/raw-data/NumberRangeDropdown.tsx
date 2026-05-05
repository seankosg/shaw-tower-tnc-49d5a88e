import { Filter } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/**
 * Numeric range header filter (min / max + Empty toggle).
 *
 * Filter value shape: `{ min?: number; max?: number; emptyOnly?: boolean }`.
 * Pair this with `numberRangeFilterFn` on the column.
 */
export function NumberRangeDropdown({ column }: { column: any }) {
  const filterValue = column.getFilterValue() as
    | { min?: number; max?: number; emptyOnly?: boolean }
    | undefined;
  const isActive =
    filterValue?.min != null || filterValue?.max != null || !!filterValue?.emptyOnly;

  const update = (patch: Partial<{ min: number | undefined; max: number | undefined; emptyOnly: boolean }>) => {
    const next = { ...(filterValue ?? {}), ...patch };
    column.setFilterValue(
      next.min != null || next.max != null || next.emptyOnly ? next : undefined,
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/80',
            isActive ? 'text-primary' : 'text-muted-foreground/50',
          )}
          onClick={(event) => event.stopPropagation()}
          title="Filter"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 space-y-2 p-3" align="start" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2 px-1">
          <button
            className="text-[11px] text-muted-foreground/40 cursor-not-allowed"
            disabled
            title="Not applicable for number filters"
          >
            Select all
          </button>
          <button
            className="text-[11px] text-muted-foreground hover:underline"
            onClick={() => column.setFilterValue(undefined)}
          >
            Clear all
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Min</label>
          <Input
            type="number"
            inputMode="numeric"
            value={filterValue?.min ?? ''}
            onChange={(event) =>
              update({
                min: event.target.value === '' ? undefined : Number(event.target.value),
              })
            }
            className="h-7 text-xs"
            disabled={!!filterValue?.emptyOnly}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Max</label>
          <Input
            type="number"
            inputMode="numeric"
            value={filterValue?.max ?? ''}
            onChange={(event) =>
              update({
                max: event.target.value === '' ? undefined : Number(event.target.value),
              })
            }
            className="h-7 text-xs"
            disabled={!!filterValue?.emptyOnly}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs">
          <Checkbox
            checked={!!filterValue?.emptyOnly}
            onCheckedChange={(checked) =>
              update({ emptyOnly: !!checked, min: undefined, max: undefined })
            }
            className="h-3.5 w-3.5"
          />
          Empty only
        </label>
      </PopoverContent>
    </Popover>
  );
}

export const numberRangeFilterFn = (row: any, columnId: string, filterValue: any) => {
  if (!filterValue) return true;
  const { min, max, emptyOnly } = filterValue as {
    min?: number;
    max?: number;
    emptyOnly?: boolean;
  };
  const raw = row.getValue(columnId);
  const isEmpty = raw == null || raw === '' || (typeof raw === 'number' && Number.isNaN(raw));
  if (emptyOnly) return isEmpty;
  if (min == null && max == null) return true;
  if (isEmpty) return false;
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isNaN(num)) return false;
  if (min != null && num < min) return false;
  if (max != null && num > max) return false;
  return true;
};
