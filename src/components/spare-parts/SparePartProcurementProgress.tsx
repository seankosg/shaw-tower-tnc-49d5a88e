import { cn } from '@/lib/utils';
import { procurementProgressLevel, procurementProgressLabel, type SparePartItem } from '@/lib/spare-part-utils';

const STAGE_PIPS = [
  { level: 1, key: 'cf', label: 'Confirm' },
  { level: 2, key: 'dr', label: 'Direction' },
  { level: 3, key: 'po', label: 'PO' },
  { level: 4, key: 'et', label: 'ETA' },
  { level: 5, key: 'dv', label: 'Delivery' },
];

interface Props {
  item: Pick<SparePartItem,
    'actual_confirm_date' | 'direction_to_subcon_date' | 'actual_po_date' | 'eta_date' |
    'actual_delivery_date' | 'planned_po_date' | 'planned_delivery_date'
  >;
  asOfDate?: string | null;
  compact?: boolean;
}

export function SparePartProcurementProgress({ item, asOfDate, compact }: Props) {
  const lvl = procurementProgressLevel(item);
  const label = procurementProgressLabel(item);
  const today = (asOfDate ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const overduePo = !item.actual_po_date && item.planned_po_date && String(item.planned_po_date).slice(0, 10) < today;
  const overdueDv = !item.actual_delivery_date && item.planned_delivery_date && String(item.planned_delivery_date).slice(0, 10) < today;
  const overdue = overduePo || overdueDv;

  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className="flex items-center gap-0.5">
        {STAGE_PIPS.map((s) => (
          <span
            key={s.key}
            className={cn(
              'inline-block h-1.5 w-3 rounded-sm',
              lvl >= s.level
                ? overdue && s.level >= 3
                  ? 'bg-destructive'
                  : 'bg-primary'
                : 'bg-muted',
            )}
          />
        ))}
      </span>
      {!compact && (
        <span className={cn('text-[10px] font-medium', overdue ? 'text-destructive' : 'text-muted-foreground')}>
          {label}
        </span>
      )}
    </span>
  );
}

export function SparePartProgressLegend() {
  return (
    <span className="inline-flex items-center gap-2 text-[10px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-1.5 w-3 rounded-sm bg-primary" /> Done
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-1.5 w-3 rounded-sm bg-destructive" /> Overdue
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-1.5 w-3 rounded-sm bg-muted" /> Pending
      </span>
    </span>
  );
}
