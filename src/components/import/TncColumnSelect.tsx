import { useMemo } from 'react';
import { ColumnSelectDialog, type ColumnSelectHelpers } from '@/components/import/ColumnSelectDialog';
import { normalizeHeader, KNOWN_FIELDS } from '@/lib/import-parser';
import { useFieldConfig } from '@/hooks/useFieldConfig';

interface TncColumnSelectProps {
  fileId: string;
  fileName: string;
  headers: string[];
  samples: Record<string, unknown>;
  defaultExcluded: string[];
  detectedImportType?: 'legacy' | 'standard' | 'unknown';
  open: boolean;
  onClose: () => void;
  onApply: (excluded: string[]) => void;
}

const TNC_FIELD_LABELS: Record<string, string> = {
  item_no: 'Item No',
  mos_code: 'MOS Code',
  subtest_id: 'Subtest ID',
  team: 'Team',
  level: 'Level',
  equipment: 'Equipment',
  description: 'Description',
  t1_planned_date: 'T1 Planned Date',
  t1_status: 'T1 Status',
  t2_planned_date: 'T2 Planned Date',
  t2_status: 'T2 Status',
  predecessor_status_raw: 'Predecessor Status',
  subcontractor_name: 'Subcontractor',
  subsub_name: 'Sub-Sub',
  hdec_pic_name: 'HDEC PIC',
  r1_status: 'R1 Status',
  r1_report_ref: 'R1 Report Ref',
  r2_status: 'R2 Status',
  aconex_ref_no: 'Aconex Ref No',
  remarks: 'Remarks',
  punchlist_comments: 'Punchlist Comments',
};

export function TncColumnSelect({
  fileName, headers, samples, defaultExcluded, detectedImportType, open, onClose, onApply,
}: TncColumnSelectProps) {
  const { isFieldRequired } = useFieldConfig();

  const helpers = useMemo<ColumnSelectHelpers>(() => ({
    toFieldName: normalizeHeader,
    getRequirement: (header: string) => {
      const field = normalizeHeader(header);
      // System-level keys: needed for header detection AND row identity.
      if (field === 'item_no') {
        return {
          required: true,
          reason: 'system',
          message: `⚠ "${header}" maps to Item No (row identity). Excluding it will likely cause the import to fail.`,
        };
      }
      if (field === 'mos_code' && detectedImportType === 'standard') {
        return {
          required: true,
          reason: 'system',
          message: `⚠ "${header}" maps to MOS Code (row identity for standard import). Excluding it will likely cause the import to fail.`,
        };
      }
      if (['mos_1', 'mos_2', 'mos_3', 'mos_4', 'mos_5'].includes(field) && detectedImportType === 'legacy') {
        return {
          required: true,
          reason: 'system',
          message: `⚠ "${header}" maps to ${field} (legacy MOS column). Excluding it will reduce the rows produced from this file.`,
        };
      }
      if (field === 'system') {
        return {
          required: true,
          reason: 'system',
          message: `⚠ "${header}" maps to System. Without it rows cannot be linked to a system and will be rejected.`,
        };
      }
      if (isFieldRequired(field)) {
        const label = TNC_FIELD_LABELS[field] || field;
        return {
          required: true,
          reason: 'config',
          message: `⚠ "${label}" is marked as required in Field Config. Excluding it may leave required fields empty.`,
        };
      }
      return { required: false };
    },
    isKnownField: (field) => KNOWN_FIELDS.has(field),
  }), [isFieldRequired, detectedImportType]);

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
