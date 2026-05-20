import { Sparkles } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { AutoEntry } from '@/lib/ddn/auto-fill-types';

export function AutoFillBadge({ entry }: { entry: AutoEntry }) {
  const preview = formatPreview(entry.value);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="ml-1 inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          <Sparkles className="h-2.5 w-2.5" /> auto
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <div className="font-medium">{entry.note}</div>
        <div className="mt-1 text-muted-foreground">Source: {entry.source}</div>
        {preview && <div className="mt-1">Suggested: <span className="font-mono">{preview}</span></div>}
      </TooltipContent>
    </Tooltip>
  );
}

function formatPreview(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return `${v.length} item(s)`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
