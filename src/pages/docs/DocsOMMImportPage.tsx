import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { parseOmmExcel, getOmmExcelSheetNames, type ParsedOmmRow } from '@/lib/docs-omm-import-parser';

interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'parsing' | 'ready' | 'processing' | 'done' | 'failed';
  parsed?: ParsedOmmRow[];
  unknownHeaders?: string[];
  error?: string;
  result?: { inserted: number; updated: number; skipped: number };
}

function formatSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

async function getDefaultProject(): Promise<{ id: string }> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) throw new Error('Not signed in.');
  const { data, error } = await (supabase as any)
    .from('projects').select('id').eq('is_active', true).order('created_at');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error('No active project');
  return { id: data[0].id };
}

export default function DocsOMMImportPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [running, setRunning] = useState(false);

  const addFiles = useCallback(async (selected: File[]) => {
    const excels = selected.filter((f) => /\.(xlsx|xls)$/i.test(f.name));
    const items: FileItem[] = excels.map((file) => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      file, name: file.name, size: file.size, status: 'parsing',
    }));
    setFiles((cur) => [...cur, ...items]);
    for (const it of items) {
      try {
        const sheets = await getOmmExcelSheetNames(it.file);
        const parsed = await parseOmmExcel(it.file, sheets);
        setFiles((cur) => cur.map((f) => f.id === it.id
          ? { ...f, status: 'ready', parsed: parsed.rows, unknownHeaders: parsed.unknownHeaders }
          : f));
      } catch (e) {
        setFiles((cur) => cur.map((f) => f.id === it.id
          ? { ...f, status: 'failed', error: e instanceof Error ? e.message : 'Parse failed' }
          : f));
      }
    }
  }, []);

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files ? Array.from(e.target.files) : []);
    if (inputRef.current) inputRef.current.value = '';
  };

  const startImport = async () => {
    const ready = files.filter((f) => f.status === 'ready' && f.parsed && f.parsed.length > 0);
    if (ready.length === 0) {
      toast({ title: 'Nothing to import', variant: 'destructive' });
      return;
    }
    setRunning(true);
    let project: { id: string };
    try {
      project = await getDefaultProject();
    } catch (e) {
      toast({ title: 'Project lookup failed', description: e instanceof Error ? e.message : '', variant: 'destructive' });
      setRunning(false);
      return;
    }

    for (const f of ready) {
      setFiles((cur) => cur.map((x) => x.id === f.id ? { ...x, status: 'processing' } : x));
      try {
        const { data: batch, error: bErr } = await (supabase as any)
          .from('docs_upload_batches').insert({
            project_id: project.id, sub_module: 'omm',
            uploaded_file_name: f.name, uploaded_by: user?.id ?? null,
            total_rows: f.parsed!.length, status: 'processing',
          }).select('id').single();
        if (bErr || !batch) throw new Error(bErr?.message ?? 'Failed to create batch');

        // Load existing by (project, sn)
        const { data: existing } = await (supabase as any)
          .from('docs_omm').select('id, sn').eq('project_id', project.id);
        const existMap = new Map<string, string>();
        for (const e of (existing ?? [])) if (e.sn) existMap.set(String(e.sn), e.id);

        let inserted = 0, updated = 0, skipped = 0;
        for (const row of f.parsed!) {
          if (!row.sn) { skipped++; continue; }
          const payload: any = {
            project_id: project.id,
            sn: row.sn,
            category: row.category,
            category_group: row.category_group,
            section: row.section,
            work_trade_material: row.work_trade_material,
            subcontractor_name: row.subcontractor_name,
            team: row.team,
            training_required: row.training_required,
            pdf_required_qty: row.pdf_required_qty,
            pdf_actual_qty: row.pdf_actual_qty,
            hardcopy_required_qty: row.hardcopy_required_qty,
            hardcopy_actual_qty: row.hardcopy_actual_qty,
            instruction_date: row.instruction_date,
            draft_planned_date: row.draft_planned_date,
            draft_actual_date: row.draft_actual_date,
            draft_response_date: row.draft_response_date,
            draft_response_status: row.draft_response_status,
            final_planned_date: row.final_planned_date,
            final_actual_date: row.final_actual_date,
            final_response_planned_date: row.final_response_planned_date,
            final_response_actual_date: row.final_response_actual_date,
            final_response_status: row.final_response_status,
            hdec_pic_name: row.hdec_pic_name,
            hdec_eng_name: row.hdec_eng_name,
            remarks: row.remarks,
            sheet_name: row.sheetName,
            row_no: row.rawRowNo,
            raw_payload: row.raw_payload,
            source_upload_id: batch.id,
            data_source_type: 'excel_import',
            updated_by: user?.id ?? null,
          };

          const existId = existMap.get(row.sn);
          if (existId) {
            const { error } = await (supabase as any)
              .from('docs_omm').update(payload).eq('id', existId);
            if (error) skipped++; else updated++;
          } else {
            const { error } = await (supabase as any)
              .from('docs_omm').insert(payload);
            if (error) skipped++; else inserted++;
          }
        }

        await (supabase as any).from('docs_upload_batches').update({
          status: 'completed',
          processed_rows: f.parsed!.length,
          success_rows: inserted + updated,
          skipped_rows: skipped,
        }).eq('id', batch.id);

        setFiles((cur) => cur.map((x) => x.id === f.id
          ? { ...x, status: 'done', result: { inserted, updated, skipped } } : x));
      } catch (e) {
        setFiles((cur) => cur.map((x) => x.id === f.id
          ? { ...x, status: 'failed', error: e instanceof Error ? e.message : 'Import failed' } : x));
      }
    }
    setRunning(false);
  };

  const readyCount = files.filter((f) => f.status === 'ready').length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Docs Import — OMM Manuals</h1>
          <p className="text-sm text-muted-foreground">
            Upload OMM register Excel. Headers map per Admin → Header Mappings → Docs / OMM.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/docs/omm')}>View OMM Raw Data</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Upload Files</CardTitle>
          <CardDescription>Drag &amp; drop xlsx / xls files, or click to browse.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); }}
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center cursor-pointer hover:border-primary hover:bg-accent/30"
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Drop OMM Excel here or click to browse</p>
            <Input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={onSelect} />
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">2. Files ({files.length})</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setFiles([])} disabled={running}>Clear all</Button>
              <Button size="sm" onClick={startImport} disabled={running || readyCount === 0}>
                {running ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Importing…</> : `Start import (${readyCount})`}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {files.map((f) => (
              <div key={f.id} className="rounded border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <FileSpreadsheet className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatSize(f.size)}
                        {f.parsed && ` · ${f.parsed.length} rows parsed`}
                      </p>
                      {f.error && (
                        <p className="mt-1 text-xs text-destructive">⚠ {f.error}</p>
                      )}
                      {f.unknownHeaders && f.unknownHeaders.length > 0 && (
                        <p className="mt-1 text-xs text-amber-600">
                          Unmapped: {f.unknownHeaders.slice(0, 5).join(', ')}{f.unknownHeaders.length > 5 ? ` (+${f.unknownHeaders.length - 5})` : ''}
                        </p>
                      )}
                      {f.result && (
                        <div className="mt-2 flex gap-2 text-xs">
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                            <CheckCircle2 className="mr-1 h-3 w-3" />Inserted: {f.result.inserted}
                          </Badge>
                          <Badge variant="outline" className="border-blue-300 text-blue-700">
                            Updated: {f.result.updated}
                          </Badge>
                          {f.result.skipped > 0 && (
                            <Badge variant="outline" className="border-amber-400 text-amber-700">
                              <AlertCircle className="mr-1 h-3 w-3" />Skipped: {f.result.skipped}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{f.status}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setFiles((c) => c.filter((x) => x.id !== f.id))} disabled={running}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
