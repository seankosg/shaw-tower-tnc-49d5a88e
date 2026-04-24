import { useNavigate } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatPct } from '@/lib/defect-utils';
import { formatDefectBucketLabel, type DefectProgressBucket, type DefectProgressDateField, type DefectProgressGroupBy, type DefectProgressRow } from '@/lib/defect-progress-utils';

interface DefectProgressMatrixProps {
  rows: DefectProgressRow[];
  buckets: string[];
  bucket: DefectProgressBucket;
  groupBy: DefectProgressGroupBy;
  dateField: DefectProgressDateField;
}

const QUERY_FIELD: Record<DefectProgressGroupBy, string> = {
  team: 'team',
  subcontractor_name: 'subcontractor',
  subsub_name: 'subsub',
  hdec_pic_name: 'hdecPic',
  area_level: 'level',
  main_trade: 'mainTrade',
  sub_trade: 'subTrade',
  work_type: 'workType',
};

export function DefectProgressMatrix({ rows, buckets, bucket, groupBy, dateField }: DefectProgressMatrixProps) {
  const navigate = useNavigate();

  const openRawData = (row: DefectProgressRow, bucketStart?: string) => {
    const params = new URLSearchParams();
    params.set(QUERY_FIELD[groupBy], row.key === '—' || row.key === '(None)' ? '__EMPTY__' : row.key);
    if (bucketStart) {
      params.set('dateStart', bucketStart);
      params.set('dateEnd', row.buckets[bucketStart]?.end ?? bucketStart);
      params.set('dateField', dateField);
    }
    navigate(`/defects/raw-data?${params.toString()}`);
  };

  return (
    <div className="overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 min-w-[220px] bg-background">Group</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Closed</TableHead>
            <TableHead className="text-right">Open</TableHead>
            <TableHead className="text-right">Overdue</TableHead>
            <TableHead className="text-right">Progress</TableHead>
            {buckets.map((key) => <TableHead key={key} className="min-w-[96px] text-center">{formatDefectBucketLabel(key, bucket)}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="sticky left-0 z-10 cursor-pointer bg-background font-medium" onClick={() => openRawData(row)}>{row.label}</TableCell>
              <TableCell className="text-right">{row.total}</TableCell>
              <TableCell className="text-right">{row.closed}</TableCell>
              <TableCell className="text-right">{row.open}</TableCell>
              <TableCell className="text-right">{row.overdue}</TableCell>
              <TableCell className="text-right">{formatPct(row.progress)}</TableCell>
              {buckets.map((key) => {
                const cell = row.buckets[key];
                return (
                  <TableCell key={key} className="cursor-pointer text-center tabular-nums hover:bg-muted" onClick={() => openRawData(row, key)}>
                    {cell ? `${cell.planned} / ${cell.closed}` : '—'}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
