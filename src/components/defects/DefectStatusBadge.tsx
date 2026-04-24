import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_CLASSES: Record<string, string> = {
  Planned: 'border-border bg-muted text-muted-foreground',
  WIP: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Done: 'border-primary/30 bg-primary/10 text-primary',
  Delay: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export function DefectStatusBadge({ status }: { status?: string | null }) {
  const value = status || 'Planned';
  const cls = STATUS_CLASSES[value] ?? STATUS_CLASSES.Planned;
  return (
    <Badge variant="outline" className={cn(cls)}>
      {value}
    </Badge>
  );
}
