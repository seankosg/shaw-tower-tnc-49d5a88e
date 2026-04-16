import { Badge } from '@/components/ui/badge';
import type { TcStatus } from '@/types/enums';
import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  Planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  WIP: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  Done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  Hold: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export function StatusBadge({ status }: { status: TcStatus | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', statusStyles[status])}>
      {status}
    </Badge>
  );
}
