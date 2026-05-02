// Backwards-compatible wrapper: forwards to the new BulkActionBar so existing callers keep working.
// New screens should import { BulkActionBar } from './BulkActionBar' directly.
import { BulkActionBar } from './BulkActionBar';
import type { BulkEditableField, BulkUpdateRequest } from '@/lib/bulk-edit';
import type { BulkEntity, ExportColumn } from '@/lib/bulk-actions';
import type { ReassignField } from './dialogs/BulkReassignDialog';

export interface BulkEditBarProps<TRow extends { id: string }> {
  selectedRows: TRow[];
  fields: BulkEditableField[];
  table: BulkUpdateRequest['table'];
  onApplied: (result: { field: string; value: string | number | null; ids: string[] }) => void;
  onClearSelection: () => void;
  /** Optional new props — if provided, the full action bar is rendered. */
  entity?: BulkEntity;
  exportColumns?: ExportColumn[];
  reassignFields?: ReassignField[];
  onMutated?: () => void;
}

export function BulkEditBar<TRow extends { id: string }>(props: BulkEditBarProps<TRow>) {
  const entity: BulkEntity = props.entity ?? (props.table === 'subtests' ? 'subtest' : 'defect');
  const exportColumns: ExportColumn[] = props.exportColumns ?? defaultColumnsFor(entity);
  const reassignFields: ReassignField[] = props.reassignFields ?? [];

  return (
    <BulkActionBar
      selectedRows={props.selectedRows}
      fields={props.fields}
      table={props.table}
      entity={entity}
      exportColumns={exportColumns}
      reassignFields={reassignFields}
      onApplied={props.onApplied}
      onClearSelection={props.onClearSelection}
      onMutated={props.onMutated}
    />
  );
}

function defaultColumnsFor(entity: BulkEntity): ExportColumn[] {
  if (entity === 'subtest') {
    return [
      { id: 'subtest_id', label: 'Subtest ID' },
      { id: 'item_no', label: 'Item No' },
      { id: 'mos_code', label: 'MOS Code' },
      { id: 'description', label: 'Description' },
      { id: 'subcontractor_name', label: 'Subcontractor' },
      { id: 'hdec_pic_name', label: 'HDEC PIC' },
      { id: 'team', label: 'Team' },
    ];
  }
  return [
    { id: 'issue_no', label: 'Issue No' },
    { id: 'description', label: 'Description' },
    { id: 'subcontractor_name', label: 'Subcontractor' },
    { id: 'hdec_pic_name', label: 'HDEC PIC' },
    { id: 'team', label: 'Team' },
    { id: 'status', label: 'Status' },
  ];
}
