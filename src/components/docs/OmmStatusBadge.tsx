import { Badge } from '@/components/ui/badge';
import { computeOmmStatus, OMM_STATUS_COLOR, type OMMStatusInput } from '@/lib/docs-omm-status';

interface Props {
  row: OMMStatusInput & { is_resubmission?: boolean; resubmission_seq?: number };
  className?: string;
}

export function OmmStatusBadge({ row, className }: Props) {
  const status = computeOmmStatus(row);
  const color = OMM_STATUS_COLOR[status];
  const suffix = row.is_resubmission && row.resubmission_seq
    ? ` (R${row.resubmission_seq})`
    : '';
  return (
    <Badge variant="outline" className={`${color} border-0 text-[10px] font-medium ${className ?? ''}`}>
      {status}{suffix}
    </Badge>
  );
}
