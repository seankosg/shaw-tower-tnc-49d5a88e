import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function DefectStatusBadge({ status }: { status?: string | null }) {
  const value = status || 'Open';
  const closed = /closed|complete|done/i.test(value);
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-border bg-muted text-muted-foreground',
        closed && 'border-primary/30 bg-primary/10 text-primary',
      )}
    >
      {value}
    </Badge>
  );
}
