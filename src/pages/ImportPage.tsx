import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseExcelFile, parseLegacy, parseStandard, resolveValue, type ParsedSubtest } from '@/lib/import-parser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

type ImportType = 'legacy' | 'standard';
type ImportPhase = 'upload' | 'preview' | 'importing' | 'done';

interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  errors: string[];
}

export default function ImportPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [importType, setImportType] = useState<ImportType>('legacy');
  const [phase, setPhase] = useState<ImportPhase>('upload');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedSubtest[]>([]);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const rows = parseExcelFile(buf);
      const subtests = importType === 'legacy' ? parseLegacy(rows) : parseStandard(rows);
      if (subtests.length === 0) {
        toast({ title: 'No valid rows found', description: 'Check the file format and headers.', variant: 'destructive' });
        return;
      }
      setParsed(subtests);
      setPhase('preview');
    } catch (e: any) {
      toast({ title: 'Parse error', description: e.message, variant: 'destructive' });
    }
  }, [importType, toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const executeImport = async () => {
    setPhase('importing');
    setProgress(0);
    const res: ImportResult = { inserted: 0, updated: 0, skipped: 0, rejected: 0, errors: [] };

    // 1. Get or create project
    const { data: projects } = await supabase.from('projects').select('id').eq('is_active', true).limit(1);
    const projectId = projects?.[0]?.id;
    if (!projectId) {
      toast({ title: 'No active project found', variant: 'destructive' });
      setPhase('preview');
      return;
    }

    // 2. Create upload batch
    const { data: batch, error: batchErr } = await supabase.from('upload_batches').insert({
      project_id: projectId,
      uploaded_file_name: fileName,
      import_type: importType,
      total_rows: parsed.length,
      status: 'processing' as any,
    }).select('id').single();

    if (batchErr || !batch) {
      toast({ title: 'Failed to create upload batch', description: batchErr?.message, variant: 'destructive' });
      setPhase('preview');
      return;
    }
    const uploadId = batch.id;

    // 3. Load systems
    const { data: systemsData } = await supabase.from('system_master').select('id, system_code').eq('project_id', projectId);
    const { data: aliasData } = await supabase.from('system_alias_map').select('alias_name, system_id').eq('project_id', projectId).eq('is_active', true);

    const systemByCode = new Map<string, string>();
    (systemsData || []).forEach(s => systemByCode.set(s.system_code.toLowerCase(), s.id));
    const aliasByName = new Map<string, string>();
    (aliasData || []).forEach(a => aliasByName.set(a.alias_name.toLowerCase(), a.system_id));

    async function resolveSystem(rawName: string): Promise<string | null> {
      if (!rawName) return null;
      const key = rawName.toLowerCase().trim();
      if (systemByCode.has(key)) return systemByCode.get(key)!;
      if (aliasByName.has(key)) return aliasByName.get(key)!;
      // Auto-create
      const { data: newSys } = await supabase.from('system_master').insert({
        project_id: projectId!,
        system_code: rawName.trim(),
        is_auto_created: true,
        requires_admin_review: true,
      }).select('id').single();
      if (newSys) {
        systemByCode.set(key, newSys.id);
        return newSys.id;
      }
      return null;
    }

    // 4. Process rows
    const rowLogs: any[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i];
      setProgress(Math.round(((i + 1) / parsed.length) * 100));

      const systemId = await resolveSystem(row.raw_system_name);
      if (!systemId) {
        res.rejected++;
        rowLogs.push({
          upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
          item_no: row.item_no, mos_code: row.mos_code, action_taken: 'rejected' as any,
          reason_code: 'system_resolve_failed', reason_detail: `Cannot resolve system: ${row.raw_system_name}`,
          mapped_system_id: null,
        });
        continue;
      }

      // Check existing
      const { data: existing } = await supabase.from('subtests')
        .select('id, updated_at, row_version')
        .eq('project_id', projectId!)
        .eq('system_id', systemId)
        .eq('item_no', row.item_no)
        .eq('mos_code', row.mos_code)
        .eq('is_active', true)
        .maybeSingle();

      const dataSourceType = importType === 'legacy' ? 'legacy_import_inherited' : 'standard_import';

      if (existing) {
        // Build update payload, skip blanks
        const updates: Record<string, any> = {};
        const fields: [string, string | null][] = [
          ['description', row.description],
          ['equipment', row.equipment],
          ['level', row.level],
          ['t1_planned_date', row.t1_planned_date],
          ['t1_status', row.t1_status],
          ['t2_planned_date', row.t2_planned_date],
          ['t2_status', row.t2_status],
          ['predecessor_status_raw', row.predecessor_status_raw],
          ['subcontractor_name', row.subcontractor_name],
          ['hdec_pic_name', row.hdec_pic_name],
        ];

        for (const [field, val] of fields) {
          const resolved = resolveValue(val, null);
          if (resolved !== undefined) {
            updates[field] = resolved;
          }
        }

        if (Object.keys(updates).length === 0) {
          res.skipped++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'skipped' as any,
            reason_code: 'no_changes', mapped_system_id: systemId,
          });
          continue;
        }

        updates.data_source_type = dataSourceType;
        updates.source_upload_id = uploadId;
        updates.row_version = (existing.row_version || 1) + 1;
        updates.subtest_id = row.subtest_id;

        const { error } = await supabase.from('subtests').update(updates).eq('id', existing.id);
        if (error) {
          res.rejected++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'rejected' as any,
            reason_code: 'update_failed', reason_detail: error.message, mapped_system_id: systemId,
          });
        } else {
          res.updated++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'updated' as any,
            mapped_system_id: systemId,
          });
        }
      } else {
        // Insert
        const { error } = await supabase.from('subtests').insert({
          project_id: projectId!,
          system_id: systemId,
          item_no: row.item_no,
          mos_code: row.mos_code,
          subtest_id: row.subtest_id,
          level: row.level,
          equipment: row.equipment,
          description: row.description,
          t1_planned_date: row.t1_planned_date,
          t1_status: row.t1_status as any,
          t2_planned_date: row.t2_planned_date,
          t2_status: row.t2_status as any,
          predecessor_status_raw: row.predecessor_status_raw,
          subcontractor_name: row.subcontractor_name,
          hdec_pic_name: row.hdec_pic_name,
          data_source_type: dataSourceType as any,
          source_upload_id: uploadId,
        });

        if (error) {
          res.rejected++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'rejected' as any,
            reason_code: 'insert_failed', reason_detail: error.message, mapped_system_id: systemId,
          });
        } else {
          res.inserted++;
          rowLogs.push({
            upload_id: uploadId, raw_row_no: row.raw_row_no, raw_system_name: row.raw_system_name,
            item_no: row.item_no, mos_code: row.mos_code, action_taken: 'inserted' as any,
            mapped_system_id: systemId,
          });
        }
      }
    }

    // 5. Save row logs in batches
    for (let i = 0; i < rowLogs.length; i += 100) {
      await supabase.from('upload_row_logs').insert(rowLogs.slice(i, i + 100));
    }

    // 6. Update batch
    await supabase.from('upload_batches').update({
      status: 'completed' as any,
      processed_rows: parsed.length,
      success_rows: res.inserted + res.updated,
      skipped_rows: res.skipped,
      rejected_rows: res.rejected,
    }).eq('id', uploadId);

    setResult(res);
    setPhase('done');
    toast({ title: 'Import complete', description: `${res.inserted} inserted, ${res.updated} updated, ${res.skipped} skipped, ${res.rejected} rejected` });
  };

  const reset = () => {
    setPhase('upload');
    setParsed([]);
    setResult(null);
    setFileName('');
    setProgress(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Import Data</h1>
        <Button variant="outline" size="sm" onClick={() => navigate('/import/logs')}>
          View Import Logs
        </Button>
      </div>

      {/* Import Type Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Import Type</CardTitle>
          <CardDescription>
            Legacy: 1 row = 1 Test with MOS-1~5 columns. Standard: 1 row = 1 Subtest.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={importType} onValueChange={(v) => { setImportType(v as ImportType); reset(); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="legacy">Legacy Import</SelectItem>
              <SelectItem value="standard">Standard Import</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Upload Phase */}
      {phase === 'upload' && (
        <Card>
          <CardContent className="pt-6">
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Drop Excel file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls files supported</p>
              <input id="file-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={onSelect} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Phase */}
      {phase === 'preview' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  {fileName}
                </CardTitle>
                <CardDescription>{parsed.length} subtests parsed</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
                <Button size="sm" onClick={executeImport}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> Execute Import
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Row</TableHead>
                    <TableHead className="text-xs">System</TableHead>
                    <TableHead className="text-xs">Item No</TableHead>
                    <TableHead className="text-xs">MOS Code</TableHead>
                    <TableHead className="text-xs">Subtest ID</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs">T1 Status</TableHead>
                    <TableHead className="text-xs">T2 Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.slice(0, 100).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{r.raw_row_no}</TableCell>
                      <TableCell className="text-xs">{r.raw_system_name}</TableCell>
                      <TableCell className="text-xs">{r.item_no}</TableCell>
                      <TableCell className="text-xs">{r.mos_code}</TableCell>
                      <TableCell className="text-xs">{r.subtest_id}</TableCell>
                      <TableCell className="text-xs truncate max-w-[200px]">{r.description || '—'}</TableCell>
                      <TableCell className="text-xs">{r.t1_status || '—'}</TableCell>
                      <TableCell className="text-xs">{r.t2_status || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {parsed.length > 100 && (
              <p className="text-xs text-muted-foreground mt-2">Showing first 100 of {parsed.length} rows</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Importing Phase */}
      {phase === 'importing' && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
              <span className="text-sm font-medium">Importing... {progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Done Phase */}
      {phase === 'done' && result && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="text-center p-3 rounded-md bg-green-50 dark:bg-green-950">
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">{result.inserted}</div>
                <div className="text-xs text-muted-foreground">Inserted</div>
              </div>
              <div className="text-center p-3 rounded-md bg-blue-50 dark:bg-blue-950">
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{result.updated}</div>
                <div className="text-xs text-muted-foreground">Updated</div>
              </div>
              <div className="text-center p-3 rounded-md bg-yellow-50 dark:bg-yellow-950">
                <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{result.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
              <div className="text-center p-3 rounded-md bg-red-50 dark:bg-red-950">
                <div className="text-2xl font-bold text-red-700 dark:text-red-300">{result.rejected}</div>
                <div className="text-xs text-muted-foreground">Rejected</div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-md bg-destructive/10 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" /> Errors
                </div>
                {result.errors.slice(0, 10).map((e, i) => (
                  <p key={i} className="text-xs text-destructive">{e}</p>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={reset}>Import Another</Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/import/logs')}>View Logs</Button>
              <Button size="sm" onClick={() => navigate('/')}>Go to Test Status</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
