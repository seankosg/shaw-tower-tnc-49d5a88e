import { Badge } from '@/components/ui/badge';
import type { DataSource } from '@/types/enums';
import { DATA_SOURCE_LABELS } from '@/types/enums';

export function DataSourceTag({ source }: { source: DataSource | null }) {
  if (!source) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="secondary" className="text-[10px] font-normal">
      {DATA_SOURCE_LABELS[source]}
    </Badge>
  );
}
