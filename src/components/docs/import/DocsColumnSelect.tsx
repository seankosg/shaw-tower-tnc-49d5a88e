import { useMemo } from 'react';
import {
  ColumnSelectDialog,
  type ColumnSelectHelpers,
} from '@/components/import/ColumnSelectDialog';
import {
  useDocsFieldConfig,
  DOCS_DEFAULT_FIELD_LABELS,
  type DocsSubModule,
} from '@/hooks/useDocsFieldConfig';

interface DocsColumnSelectProps {
  subModule: DocsSubModule;
  fileName: string;
  headers: string[];
  samples: Record<string, unknown>;
  fieldByHeader: Record<string, string | null>;
  defaultExcluded: string[];
  open: boolean;
  onClose: () => void;
  onApply: (excluded: string[]) => void;
}

const ABD_SYSTEM_REQUIRED = new Set(['document_no']);
const OMM_SYSTEM_REQUIRED = new Set(['sn']);

export function DocsColumnSelect({
  subModule,
  fileName,
  headers,
  samples,
  fieldByHeader,
  defaultExcluded,
  open,
  onClose,
  onApply,
}: DocsColumnSelectProps) {
  const { isFieldRequired, getLabel } = useDocsFieldConfig(subModule);
  const systemRequired = subModule === 'omm' ? OMM_SYSTEM_REQUIRED : ABD_SYSTEM_REQUIRED;
  const keyLabel = subModule === 'omm' ? 'SN' : 'Document No';

  const helpers = useMemo<ColumnSelectHelpers>(() => ({
    toFieldName: (header: string) => fieldByHeader[header] ?? '',
    getRequirement: (header: string) => {
      const field = fieldByHeader[header] ?? '';
      if (field && systemRequired.has(field)) {
        return {
          required: true,
          reason: 'system',
          message: `⚠ "${header}" maps to ${keyLabel}, the row identity for ${subModule === 'omm' ? 'OMM' : 'ABD'} import. Excluding it will cause the import to skip every row.`,
        };
      }
      if (field && isFieldRequired(field)) {
        const label = getLabel ? getLabel(field) : (DOCS_DEFAULT_FIELD_LABELS[field] ?? field);
        return {
          required: true,
          reason: 'config',
          message: `⚠ "${label}" is marked as required in Field Config. Excluding it may leave required fields empty.`,
        };
      }
      return { required: false };
    },
    isKnownField: (field: string) => !!field,
  }), [fieldByHeader, isFieldRequired, getLabel, systemRequired, keyLabel, subModule]);

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
