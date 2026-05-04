import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  icon: LucideIcon;
  label: string;
  total: number;
  submitted: number;
  red: number;
  onClick?: () => void;
  disabled?: boolean;
}

export function DocsModuleKpiCard({ icon: Icon, label, total, submitted, red, onClick, disabled }: Props) {
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
  const interactive = !!onClick && !disabled;
  return (
    <Card
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={(e) => {
        if (interactive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        'p-4 transition-colors',
        interactive && 'cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        disabled && 'opacity-60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-muted p-1.5">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        </div>
        {red > 0 && (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
            R {red}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{total.toLocaleString()}</span>
        <span className="text-xs text-muted-foreground">total</span>
      </div>
      <div className="mt-2">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{submitted.toLocaleString()} submitted</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} className="mt-1 h-1.5" />
      </div>
    </Card>
  );
}
