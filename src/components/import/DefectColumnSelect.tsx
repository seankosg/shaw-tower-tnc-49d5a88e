import { useMemo } from 'react';
import { ColumnSelectDialog, type ColumnSelectHelpers } from '@/components/import/ColumnSelectDialog';
import { toFieldName } from '@/lib/defect-parser';
import { useDefectFieldConfig } from '@/hooks/useDefectFieldConfig';

interface DefectColumnSelectProps {
  fileId: string;
  fileName: string;
  headers: string[];
  samples: Record<string, unknown>;
  defaultExcluded: string[];
  isReimport: boolean;
  open: boolean;
  onClose: () => void;
  onApply: (excluded: string[]) => void;
}

const DEFECT_KNOWN_FIELDS = new Set([
  'issue_no', 'id', 'area_raw', 'area_type', 'area_level', 'area_location',
  'main_trade', 'sub_trade', 'trade_detail', 'description', 'defect_type',
  'status', 'priority', 'team', 'subcontractor_name', 'subsub_name',
  'hdec_pic_name', 'hdec_eng_name', 'captured_by_name',
  'planned_start_date', 'planned_completion_date', 'planned_closure_date',
  'actual_start_date', 'actual_completion_date', 'actual_closure_date',
  'planned_progress_pct', 'actual_progress_pct',
  'completion_status', 'closure_status', 'remarks',
  'hdec_comments', 'aconex_comments', 'work_type',
  'subcontractor_issue_no', 'subcontractor_issue_source',
  'hdec_verification', 'hdec_reason',
]);

export function DefectColumnSelect({
  fileName, headers, samples, defaultExcluded, isReimport, open, onClose, onApply,
}: DefectColumnSelectProps) {
  const { isFieldRequired, getLabel, getSourceLabel, getSourceOrigin } = useDefectFieldConfig();

  const helpers = useMemo<ColumnSelectHelpers>(() => ({
    toFieldName,
    getRequirement: (header: string) => {
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
    },
    getSourceLabel,
    getSourceOrigin,
    isKnownField: (field) => DEFECT_KNOWN_FIELDS.has(field) || isFieldRequired(field),
    extraWarnings: (excluded) => {
      const lines: string[] = [];
      const areaRawExcluded = Array.from(excluded).some((h) => toFieldName(h) === 'area_raw');
      if (areaRawExcluded) {
        lines.push('Excluding "Area" will also clear the derived Type / Level / Location fields for this import.');
      }
      return lines;
    },
  }), [isReimport, isFieldRequired, getLabel, getSourceLabel, getSourceOrigin]);

  const presets = useMemo(() => {
    const ACONEX_FIELDS = new Set(['issue_no', 'status', 'actual_closure_date', 'aconex_comments', 'priority']);
    const HDEC_FIELDS = new Set([
      'issue_no', 'team', 'subcontractor_name', 'subsub_name',
      'hdec_pic_name', 'hdec_eng_name',
      'planned_start_date', 'planned_completion_date', 'planned_closure_date',
      'actual_start_date', 'actual_completion_date', 'actual_closure_date',
    ]);
    const CAT_CHECK_FIELDS = new Set([
      'issue_no', 'description', 'priority',
      'hdec_verification', 'hdec_reason',
      'closure_status', 'actual_closure_date',
    ]);
    const isVerifiedByHdecHeader = (h: string) => {
      const n = h.toLowerCase();
      return n.includes('verified') && (n.includes('hdec') || n.includes('field'));
    };

    const aconexHeaders = headers.filter((h) => {
      const f = toFieldName(h);
      return ACONEX_FIELDS.has(f) || isVerifiedByHdecHeader(h);
    });
    const hdecHeaders = headers.filter((h) => HDEC_FIELDS.has(toFieldName(h)));
    const catCheckHeaders = headers.filter((h) => CAT_CHECK_FIELDS.has(toFieldName(h)));

    return [
      {
        id: 'new-upload',
        label: 'New Upload',
        matchedHeaders: undefined, // select all
      },
      {
        id: 'update-aconex',
        label: 'Update from Aconex',
        matchedHeaders: aconexHeaders,
        className: 'border-emerald-300 text-emerald-900 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-100 dark:hover:bg-emerald-950',
      },
      {
        id: 'update-hdec',
        label: "HDEC's Update",
        matchedHeaders: hdecHeaders,
        className: 'border-blue-300 text-blue-900 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-100 dark:hover:bg-blue-950',
      },
      {
        id: 'cat-check',
        label: 'Cat Check',
        matchedHeaders: catCheckHeaders,
        className: 'border-rose-300 text-rose-900 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-100 dark:hover:bg-rose-950',
      },
    ];
  }, [headers]);


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
      presets={presets}
    />
  );
}
