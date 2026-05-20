import { Sparkles, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AutoFillResult } from '@/lib/ddn/auto-fill-types';

interface Props {
  result: AutoFillResult | undefined;
  isFetching: boolean;
  disabled?: boolean;
  onRefresh: () => void;
  onApplyEmpty: () => void;
  onOverwrite: () => void;
}

export function AutoFillBanner({ result, isFetching, disabled, onRefresh, onApplyEmpty, onOverwrite }: Props) {
  const count = result ? Object.keys(result.map).length : 0;
  const errors = result?.errors ?? [];
  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium">
            Auto-fill available for {count} field{count === 1 ? '' : 's'}
          </span>
          <span className="text-xs text-muted-foreground">• Scope: Puretech only</span>
        </div>
        {errors.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="h-3 w-3" /> {errors.length} source error(s)
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onRefresh} disabled={isFetching}>
            <RefreshCw className={`mr-1 h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onApplyEmpty} disabled={disabled || count === 0}>
            Apply to empty
          </Button>
          <Button type="button" size="sm" variant="default" onClick={onOverwrite} disabled={disabled || count === 0}>
            Overwrite all
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
