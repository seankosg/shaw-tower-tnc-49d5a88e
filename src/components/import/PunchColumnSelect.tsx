import { useMemo } from 'react';
import {
  ColumnSelectDialog,
  type ColumnSelectHelpers,
} from '@/components/import/ColumnSelectDialog';
import {
  usePunchFieldConfig,
  PUNCH_DEFAULT_FIELD_LABELS,
} from '@/hooks/usePunchFieldConfig';
import { PUNCH_FIELDS } from '@/lib/punch-field-registry';

interface PunchColumnSelectProps {
  fileName: string;
  headers: string[];
  samples: Record<string, unknown>;
  /** Header → resolved field name (or null if unmapped). Pre-computed by the parser. */
  fieldByHeader: Record<string, string | null>;
  defaultExcluded: string[];
  open: boolean;
  onClose: () => void;
  onApply: (excluded: string[]) => void;
}

const SYSTEM_REQUIRED = new Set<string>(['outstanding_work']);
const KNOWN_FIELDS = new Set<string>(PUNCH_FIELDS.map((f) => f.field));

export function PunchColumnSelect({
  fileName,
  headers,
  samples,
  fieldByHeader,
  defaultExcluded,
  open,
  onClose,
  onApply,
}: PunchColumnSelectProps) {
  const { isFieldRequired, getLabel } = usePunchFieldConfig();

  const helpers = useMemo<ColumnSelectHelpers>(() => ({
    toFieldName: (header: string) => fieldByHeader[header] ?? '',
    getRequirement: (header: string) => {
      const field = fieldByHeader[header] ?? '';
      if (field && SYSTEM_REQUIRED.has(field)) {
        return {
          required: true,
          reason: 'system',
          message: `⚠ "${header}" maps to Outstanding Works, which is required for every Punch row. Excluding it will reject every row.`,
        };
      }
      if (field && isFieldRequired(field)) {
        const label = getLabel(field) || PUNCH_DEFAULT_FIELD_LABELS[field] || field;
        return {
          required: true,
          reason: 'config',
          message: `⚠ "${label}" is marked as required in Field Config. Excluding it may leave required fields empty.`,
        };
      }
      return { required: false };
    },
    isKnownField: (field: string) => !!field && KNOWN_FIELDS.has(field),
  }), [fieldByHeader, isFieldRequired, getLabel]);

  return (
    <ColumnSelectDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      fileName={fileName}
      headers={headers}
      samples={samples}
      defaultExcluded={defaultExcluded}
      onApply={onApply}
      helpers={helpers}
    />
  );
}
