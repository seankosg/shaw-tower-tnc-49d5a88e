import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Star } from 'lucide-react';
import { toFieldName } from '@/lib/defect-parser';
import { useDefectFieldConfig } from '@/hooks/useDefectFieldConfig';

interface ColumnSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  headers: string[];
  samples: Record<string, unknown>;
  defaultExcluded: string[];
  isReimport: boolean;
  onApply: (excluded: string[]) => void;
}

type RequirementReason = 'system' | 'reimport' | 'config';

interface Requirement {
  required: boolean;
  reason?: RequirementReason;
  message?: string;
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
  isReimport,
  onApply,
}: ColumnSelectDialogProps) {
  const { isFieldRequired, getLabel, getSourceLabel, getSourceOrigin } = useDefectFieldConfig();
  const [excluded, setExcluded] = useState<Set<string>>(new Set(defaultExcluded));

  // Reset internal state when dialog re-opens with possibly different defaults.
  useEffect(() => {
    if (open) setExcluded(new Set(defaultExcluded));
  }, [open, defaultExcluded]);

  const getRequirement = useMemo(() => {
    return (header: string): Requirement => {
      const field = toFieldName(header);
      if (field === 'issue_no') {
        return {
          required: true,
          reason: 'system',
          message: `⚠ "${header}" maps to Issue No, which is required for header detection. Excluding it will likely cause the import to fail.`,
        };
      }
      if (isReimport && field === 'id') {
        return {
          required: true,
          reason: 'reimport',
          message: `⚠ Excluding "${header}" on a Re-import file will create new rows instead of updating existing ones.`,
        };
      }
      if (isFieldRequired(field)) {
        return {
          required: true,
          reason: 'config',
          message: `⚠ "${getLabel(field)}" is marked as required in Field Config. Excluding it may leave required fields empty.`,
        };
      }
      return { required: false };
    };
  }, [isReimport, isFieldRequired, getLabel]);

  const requiredHeaders = useMemo(
    () => headers.filter((h) => getRequirement(h).required),
    [headers, getRequirement],
  );
  const excludedRequiredMessages = useMemo(
    () =>
      requiredHeaders
        .filter((h) => excluded.has(h))
        .map((h) => ({ header: h, message: getRequirement(h).message! })),
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
  const reset = () => setExcluded(new Set(defaultExcluded));

  const handleApply = () => {
    onApply(Array.from(excluded));
    onOpenChange(false);
  };

  // Has area_raw been excluded? (warn user about derived fields)
  const areaRawExcluded = useMemo(
    () => Array.from(excluded).some((h) => toFieldName(h) === 'area_raw'),
    [excluded],
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
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={selectAll}>
              Select all
            </Button>
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
            const isUnmapped = !field || field === header.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            // Heuristic: if field equals the slugified header verbatim AND not a known
            // field config entry, treat as unmapped for display purposes.
            const knownField = isFieldRequired(field) || ['issue_no', 'id', 'area_raw', 'main_trade', 'sub_trade'].includes(field);
            const showAsUnmapped = isUnmapped && !knownField;

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
                <div className="min-w-0 truncate text-xs">
                  {showAsUnmapped ? (
                    <span className="text-muted-foreground italic">(unmapped)</span>
                  ) : (
                    <code className="text-foreground">{field}</code>
                  )}
                </div>
                <div className="min-w-0 truncate text-xs text-muted-foreground">{sample}</div>
              </div>
            );
          })}
        </div>

        {(excludedRequiredMessages.length > 0 || areaRawExcluded) && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              Warnings
            </div>
            <ul className="space-y-1 text-xs text-amber-900 dark:text-amber-200 list-disc pl-5">
              {excludedRequiredMessages.map(({ header, message }) => (
                <li key={header}>{message}</li>
              ))}
              {areaRawExcluded && (
                <li>Excluding "Area" will also clear the derived Type / Level / Location fields for this import.</li>
              )}
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
