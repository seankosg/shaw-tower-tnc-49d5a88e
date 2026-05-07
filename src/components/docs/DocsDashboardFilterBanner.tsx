import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  type DashboardFilterParams,
  hasAnyDashboardFilter,
  dashboardFilterLabel,
} from '@/lib/docs-dashboard-filter';
import type { DocModule } from '@/lib/docs-stage-records';

interface Props {
  module: DocModule;
  params: DashboardFilterParams;
  onClear: () => void;
}

export function DocsDashboardFilterBanner({ module, params, onClear }: Props) {
  if (!hasAnyDashboardFilter(params)) return null;
  const label = dashboardFilterLabel(module, params);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
      <Badge variant="default" className="bg-primary text-primary-foreground">From Dashboard</Badge>
      <span className="text-xs text-foreground">{label}</span>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-7 gap-1 text-xs"
        onClick={onClear}
      >
        <X className="h-3.5 w-3.5" /> Clear
      </Button>
    </div>
  );
}
