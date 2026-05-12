import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Star } from 'lucide-react';

export type ColumnRequirementReason = 'system' | 'reimport' | 'config';

export interface ColumnRequirement {
  required: boolean;
  reason?: ColumnRequirementReason;
  message?: string;
}

export interface ColumnSelectHelpers {
  /** Map a raw header string to its canonical field name. */
  toFieldName: (header: string) => string;
  /** Decide whether a given header is required (and why). */
  getRequirement: (header: string) => ColumnRequirement;
  /** Optional — used for showing an origin badge next to mapped fields. */
  getSourceLabel?: (field: string) => string;
  /** Optional — used to colour the origin badge and power "X only" quick filters. */
  getSourceOrigin?: (field: string) => 'hdec' | 'aconex' | 'system';
  /** Optional — heuristic to mark a field as "unmapped" in the dialog. */
  isKnownField?: (field: string) => boolean;
  /** Optional — extra warning lines shown in the warning box below the list. */
  extraWarnings?: (excluded: Set<string>) => string[];
}

interface ColumnSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  headers: string[];
  samples: Record<string, unknown>;
  defaultExcluded: string[];
  onApply: (excluded: string[]) => void;
  helpers: ColumnSelectHelpers;
  /** Optional preset buttons that set a baseline selection (user can still toggle further). */
  presets?: Array<{
    id: string;
    label: string;
    /** Headers to keep selected. Empty/undefined = select all. */
    matchedHeaders?: string[];
    className?: string;
  }>;
}

function previewValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (s.length > 40) return `${s.slice(0, 40)}…`;
  return s;
}

export function ColumnSelectDialog({
  open,
  onOpenChange,
  fileName,
  headers,
  samples,
  defaultExcluded,
  onApply,
  helpers,
  presets,
}: ColumnSelectDialogProps) {
  const { toFieldName, getRequirement, getSourceLabel, getSourceOrigin, isKnownField, extraWarnings } = helpers;
  const [excluded, setExcluded] = useState<Set<string>>(new Set(defaultExcluded));

  // Reset internal state when dialog re-opens with possibly different defaults.
  useEffect(() => {
    if (open) setExcluded(new Set(defaultExcluded));
  }, [open, defaultExcluded]);

  const requiredHeaders = useMemo(
    () => headers.filter((h) => getRequirement(h).required),
    [headers, getRequirement],
  );
  const excludedRequiredMessages = useMemo(
    () =>
      requiredHeaders
        .filter((h) => excluded.has(h))
        .map((h) => ({ header: h, message: getRequirement(h).message ?? `"${h}" is required.` })),
    [requiredHeaders, excluded, getRequirement],
  );

  const selectedCount = headers.length - excluded.size;
  const totalCount = headers.length;

  const toggle = (header: string, nextChecked: boolean) => {
    const req = getRequirement(header);
    if (req.required && !nextChecked && req.message) {
      toast.warning(req.message);
    }
    setExcluded((current) => {
      const next = new Set(current);
      if (nextChecked) next.delete(header);
      else next.add(header);
      return next;
    });
  };

  const selectAll = () => setExcluded(new Set());
  const deselectAll = () => setExcluded(new Set(headers));
  const applyPreset = (matched?: string[]) => {
    if (!matched || matched.length === 0) {
      setExcluded(new Set());
      return;
    }
    const allow = new Set(matched);
    setExcluded(new Set(headers.filter((h) => !allow.has(h))));
  };
  const reset = () => setExcluded(new Set(defaultExcluded));

  const handleApply = () => {
    onApply(Array.from(excluded));
    onOpenChange(false);
  };

  const extraWarningLines = useMemo(
    () => (extraWarnings ? extraWarnings(excluded) : []),
    [extraWarnings, excluded],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Select Columns</DialogTitle>
          <DialogDescription>
            <span className="truncate">{fileName}</span>
            <br />
            Choose which Excel columns should be included in this import. Unchecked columns
            will be ignored. Existing values in the database are preserved (blank-overwrite is
            disabled by default).
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 border-b pb-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={selectAll}>
              Select all
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={deselectAll}>
              Deselect all
            </Button>
            {presets && presets.map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => applyPreset(p.matchedHeaders)}
                className={p.className}
              >
                {p.label}
              </Button>
            ))}
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              Reset
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{selectedCount}/{totalCount}</span>
            {excludedRequiredMessages.length > 0 && (
              <>
                {' · '}
                <span className="text-amber-700 dark:text-amber-300 font-medium">
                  Required excluded: {excludedRequiredMessages.length}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-md border">
          <div className="grid grid-cols-[40px_1.2fr_1fr_1fr] gap-2 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground sticky top-0 z-10">
            <span></span>
            <span>Excel Column</span>
            <span>Maps to Field</span>
            <span>Sample</span>
          </div>
          {headers.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No headers detected.
            </div>
          )}
          {headers.map((header) => {
            const checked = !excluded.has(header);
            const field = toFieldName(header);
            const req = getRequirement(header);
            const sample = previewValue(samples[header]);
            const slug = header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            const showAsUnmapped = isKnownField
              ? !isKnownField(field)
              : (!field || field === slug);

            return (
              <div
                key={header}
                className="grid grid-cols-[40px_1.2fr_1fr_1fr] gap-2 items-center border-b px-3 py-2 last:border-b-0 hover:bg-muted/50"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => toggle(header, v === true)}
                  aria-label={`Include ${header}`}
                />
                <div className="min-w-0 flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{header}</span>
                  {req.required && (
                    <Badge
                      variant="outline"
                      className="bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100 text-[10px] gap-0.5 px-1.5 py-0"
                      title={req.message}
                    >
                      <Star className="h-2.5 w-2.5" />
                      Required
                    </Badge>
                  )}
                </div>
                <div className="min-w-0 flex items-center gap-1.5 text-xs">
                  {showAsUnmapped ? (
                    <span className="text-muted-foreground italic">(unmapped)</span>
                  ) : (
                    <code className="text-foreground truncate">{field}</code>
                  )}
                  {!showAsUnmapped && getSourceLabel && getSourceOrigin && (() => {
                    const origin = getSourceOrigin(field);
                    const cls =
                      origin === 'hdec'
                        ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                        : origin === 'aconex'
                          ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100'
                          : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200';
                    return (
                      <Badge variant="outline" className={`${cls} text-[10px] px-1.5 py-0 shrink-0`}>
                        {getSourceLabel(field)}
                      </Badge>
                    );
                  })()}
                </div>
                <div className="min-w-0 truncate text-xs text-muted-foreground">{sample}</div>
              </div>
            );
          })}
        </div>

        {(excludedRequiredMessages.length > 0 || extraWarningLines.length > 0) && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              Warnings
            </div>
            <ul className="space-y-1 text-xs text-amber-900 dark:text-amber-200 list-disc pl-5">
              {excludedRequiredMessages.map(({ header, message }) => (
                <li key={header}>{message}</li>
              ))}
              {extraWarningLines.map((line, i) => (
                <li key={`x${i}`}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
