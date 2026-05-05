import { AlertTriangle } from 'lucide-react';
import { copyAlertState } from '@/lib/docs-omm-status';
import { cn } from '@/lib/utils';

interface Props {
  required: number | null | undefined;
  actual: number | null | undefined;
  /** Display label like "PDF" or "HC". Optional. */
  label?: string;
  className?: string;
}

const STATE_STYLES: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  short: 'bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200 ring-1 ring-rose-300',
  over: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 ring-1 ring-amber-300',
  pending: 'bg-slate-50 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300',
};

export function OmmCopyQuantityCell({ required, actual, label, className }: Props) {
  const state = copyAlertState(required, actual);
  const reqDisp = required ?? '—';
  const actDisp = actual ?? '—';
  const tooltip =
    state === 'short' ? `Short: actual ${actDisp} < required ${reqDisp}` :
    state === 'over' ? `Over: actual ${actDisp} > required ${reqDisp}` :
    state === 'ok' ? `Match: ${actDisp}/${reqDisp}` :
    `Pending: ${actDisp}/${reqDisp}`;
  return (
    <span
      title={tooltip}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-mono tabular-nums',
        STATE_STYLES[state],
        className,
      )}
    >
      {label && <span className="text-[9px] opacity-70">{label}</span>}
      <span>{actDisp}</span>
      <span className="opacity-60">/</span>
      <span>{reqDisp}</span>
      {(state === 'short' || state === 'over') && <AlertTriangle className="h-3 w-3" />}
    </span>
  );
}
