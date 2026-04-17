import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseExcelFile, parseLegacy, parseStandard, resolveValue, type ParsedSubtest } from '@/lib/import-parser';
import { useToast } from '@/hooks/use-toast';

export type ImportType = 'legacy' | 'standard';
export type FileStatus = 'pending' | 'parsing' | 'ready' | 'processing' | 'done' | 'failed';

export interface ImportFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: FileStatus;
  parsedCount: number;
  progress: number;
  result?: { inserted: number; updated: number; skipped: number; rejected: number };
  error?: string;
  parsed?: ParsedSubtest[];
}

interface ImportContextValue {
  files: ImportFileItem[];
  importType: ImportType;
  isRunning: boolean;
  currentIndex: number;
  setImportType: (t: ImportType) => void;
  addFiles: (files: File[]) => Promise<void>;
  removeFile: (id: string) => void;
  clearAll: () => void;
  startImport: () => Promise<void>;
}

const ImportContext = createContext<ImportContextValue | null>(null);

export function useImport() {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error('useImport must be used within ImportProvider');
  return ctx;
}

export function ImportProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [files, setFiles] = useState<ImportFileItem[]>([]);
  const [importType, setImportTypeState] = useState<ImportType>('legacy');
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const importTypeRef = useRef<ImportType>('legacy');

  const setImportType = (t: ImportType) => {
    importTypeRef.current = t;
    setImportTypeState(t);
  };

  const updateFile = (id: string, patch: Partial<ImportFileItem>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  };

  const addFiles = useCallback(async (newFiles: File[]) => {
    const items: ImportFileItem[] = newFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      name: file.name,
      size: file.size,
      status: 'parsing',
      parsedCount: 0,
      progress: 0,
    }));
    setFiles(prev => [...prev, ...items]);

    for (const item of items) {
      try {
        const buf = await item.file.arrayBuffer();
        const rows = parseExcelFile(buf);
        const subtests = importTypeRef.current === 'legacy' ? parseLegacy(rows) : parseStandard(rows);
        if (subtests.length === 0) {
          updateFile(item.id, { status: 'failed', error: 'No valid rows found' });
        } else {
          updateFile(item.id, { status: 'ready', parsedCount: subtests.length, parsed: subtests });
        }
      } catch (e: any) {
        updateFile(item.id, { status: 'failed', error: e.message });
      }
    }
  }, []);

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    setFiles([]);
    setCurrentIndex(-1);
  };

  const processFile = async (item: ImportFileItem): Promise<{ inserted: number; updated: number; skipped: number; rejected: number } | null> => {
    if (!item.parsed) return null;
    const parsed = item.parsed;
    const res = { inserted: 0, updated: 0, skipped: 0, rejected: 0 };
    const userCreateFails: string[] = [];

    const { data: projects } = await supabase.from('projects').select('id').eq('is_active', true).limit(1);
    const projectId = projects?.[0]?.id;
    if (!projectId) throw new Error('No active project found');

    const { data: batch, error: batchErr } = await supabase.from('upload_batches').insert({
      project_id: projectId,
      uploaded_file_name: item.name,
      import_type: importTypeRef.current,
      total_rows: parsed.length,
      status: 'processing' as any,
    }).select('id').single();
    if (batchErr || !batch) throw new Error(batchErr?.message || 'Failed to create batch');
    const uploadId = batch.id;

    const { data: systemsData } = await supabase.from('system_master').select('id, system_code').eq('project_id', projectId);
    const { data: aliasData } = await supabase.from('system_alias_map').select('alias_name, system_id').eq('project_id', projectId).eq('is_active', true);
    const systemByCode = new Map<string, string>();
    (systemsData || []).forEach(s => systemByCode.set(s.system_code.toLowerCase(), s.id));
    const aliasByName = new Map<string, string>();
    (aliasData || []).forEach(a => aliasByName.set(a.alias_name.toLowerCase(), a.system_id));

    // Master caches: name(lowercased) -> id
    const { data: subData } = await supabase.from('subcontractor_master').select('id, name, type, parent_subcontractor_id, is_active');
    const { data: hdecData } = await supabase.from('hdec_pic_master').select('id, name, is_active');
    const subconCache = new Map<string, { id: string; active: boolean }>();
    const subsubCache = new Map<string, { id: string; active: boolean; parent_id: string | null }>();
    (subData || []).forEach((m: any) => {
      const t = m.type ?? 'sub';
      if (t === 'sub') subconCache.set(m.name.toLowerCase().trim(), { id: m.id, active: m.is_active });
      else subsubCache.set(m.name.toLowerCase().trim(), { id: m.id, active: m.is_active, parent_id: m.parent_subcontractor_id });
    });
    const hdecCache = new Map<string, { id: string; active: boolean }>();
    (hdecData || []).forEach((m: any) => hdecCache.set(m.name.toLowerCase().trim(), { id: m.id, active: m.is_active }));

    async function ensureSubcontractor(name: string | null): Promise<void> {
      if (!name) return;
      const key = name.toLowerCase().trim();
      if (subconCache.has(key)) return;
      const { data: ins } = await supabase.from('subcontractor_master')
        .insert({ name: name.trim(), type: 'sub' } as any).select('id').single();
      if (!ins) return;
      subconCache.set(key, { id: ins.id, active: true });
      const { error: fnErr } = await supabase.functions.invoke('auto-create-master-user', {
        body: { name: name.trim(), master_type: 'subcontractor', subcontractor_name: name.trim() },
      });
      if (fnErr) userCreateFails.push(`${name.trim()} (sub): ${fnErr.message}`);
    }

    async function ensureSubsub(name: string | null, parentName: string | null): Promise<void> {
      if (!name) return;
      const key = name.toLowerCase().trim();
      if (subsubCache.has(key)) return;
      let parentId: string | null = null;
      if (parentName) {
        await ensureSubcontractor(parentName);
        parentId = subconCache.get(parentName.toLowerCase().trim())?.id ?? null;
      }
      if (!parentId) {
        const anyParent = subconCache.values().next().value;
        if (!anyParent) return;
        parentId = anyParent.id;
      }
      const { data: ins } = await supabase.from('subcontractor_master')
        .insert({ name: name.trim(), type: 'subsub', parent_subcontractor_id: parentId } as any).select('id').single();
      if (!ins) return;
      subsubCache.set(key, { id: ins.id, active: true, parent_id: parentId });
      const { error: fnErr } = await supabase.functions.invoke('auto-create-master-user', {
        body: {
          name: name.trim(), master_type: 'subsub',
          subcontractor_name: parentName ?? null, subsub_name: name.trim(),
        },
      });
      if (fnErr) userCreateFails.push(`${name.trim()} (subsub): ${fnErr.message}`);
    }

    async function ensureHdecPic(name: string | null): Promise<void> {
      if (!name) return;
      const key = name.toLowerCase().trim();
      if (hdecCache.has(key)) return;
      const { data: ins } = await supabase.from('hdec_pic_master')
        .insert({ name: name.trim() }).select('id').single();
      if (!ins) return;
      hdecCache.set(key, { id: ins.id, active: true });
      const { error: fnErr } = await supabase.functions.invoke('auto-create-master-user', {
        body: { name: name.trim(), master_type: 'hdec_pic', hdec_pic_name: name.trim() },
      });
      if (fnErr) userCreateFails.push(`${name.trim()} (hdec_pic): ${fnErr.message}`);
    }

    async function resolveSystem(rawName: string): Promise<string | null> {
      if (!rawName) return null;
      const key = rawName.toLowerCase().trim();
      if (systemByCode.has(key)) return systemByCode.get(key)!;
      if (aliasByName.has(key)) return aliasByName.get(key)!;
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

    const rowLogs: any[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const row = parsed[i];
      updateFile(item.id, { progress: Math.round(((i + 1) / parsed.length) * 100) });

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

      // Auto-register masters mentioned in this row
      await ensureSubcontractor(row.subcontractor_name);
      await ensureSubsub(row.subsub_name, row.subcontractor_name);
      await ensureHdecPic(row.hdec_pic_name);

      const { data: existing } = await supabase.from('subtests')
        .select('id, updated_at, row_version')
        .eq('project_id', projectId!).eq('system_id', systemId)
        .eq('item_no', row.item_no).eq('mos_code', row.mos_code).eq('is_active', true)
        .maybeSingle();

      const dataSourceType = importTypeRef.current === 'legacy' ? 'legacy_import_inherited' : 'standard_import';

      if (existing) {
        const updates: Record<string, any> = {};
        const fields: [string, string | null][] = [
          ['description', row.description], ['equipment', row.equipment], ['level', row.level],
          ['t1_planned_date', row.t1_planned_date], ['t1_status', row.t1_status],
          ['t2_planned_date', row.t2_planned_date], ['t2_status', row.t2_status],
          ['predecessor_status_raw', row.predecessor_status_raw],
          ['subcontractor_name', row.subcontractor_name],
          ['subsub_name', row.subsub_name],
          ['hdec_pic_name', row.hdec_pic_name],
          ['r1_status', row.r1_status],
          ['r2_status', row.r2_status],
          ['aconex_ref_no', row.aconex_ref_no],
          ['remarks', row.remarks],
          ['punchlist_comments', row.punchlist_comments],
        ];
        for (const [field, val] of fields) {
          const resolved = resolveValue(val, null);
          if (resolved !== undefined) updates[field] = resolved;
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

        const { error } = await supabase.from('subtests').update(updates as any).eq('id', existing.id);
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
        const { error } = await supabase.from('subtests').insert({
          project_id: projectId!, system_id: systemId,
          item_no: row.item_no, mos_code: row.mos_code, subtest_id: row.subtest_id,
          level: row.level, equipment: row.equipment, description: row.description,
          t1_planned_date: row.t1_planned_date, t1_status: row.t1_status as any,
          t2_planned_date: row.t2_planned_date, t2_status: row.t2_status as any,
          predecessor_status_raw: row.predecessor_status_raw,
          subcontractor_name: row.subcontractor_name,
          subsub_name: row.subsub_name,
          hdec_pic_name: row.hdec_pic_name,
          r1_status: row.r1_status,
          r2_status: row.r2_status,
          aconex_ref_no: row.aconex_ref_no,
          remarks: row.remarks,
          punchlist_comments: row.punchlist_comments,
          data_source_type: dataSourceType as any, source_upload_id: uploadId,
        } as any);
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

    for (let i = 0; i < rowLogs.length; i += 100) {
      await supabase.from('upload_row_logs').insert(rowLogs.slice(i, i + 100));
    }

    await supabase.from('upload_batches').update({
      status: 'completed' as any,
      processed_rows: parsed.length,
      success_rows: res.inserted + res.updated,
      skipped_rows: res.skipped,
      rejected_rows: res.rejected,
    }).eq('id', uploadId);

    if (userCreateFails.length > 0) {
      toast({
        title: `${userCreateFails.length} user account(s) failed`,
        description: userCreateFails.slice(0, 3).join('; ') + (userCreateFails.length > 3 ? '...' : ''),
        variant: 'destructive',
      });
    }

    return res;
  };

  const startImport = async () => {
    const queue = files.filter(f => f.status === 'ready');
    if (queue.length === 0) return;
    setIsRunning(true);

    let totals = { inserted: 0, updated: 0, skipped: 0, rejected: 0 };

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setCurrentIndex(files.findIndex(f => f.id === item.id));
      updateFile(item.id, { status: 'processing', progress: 0 });
      try {
        const res = await processFile(item);
        if (res) {
          updateFile(item.id, { status: 'done', progress: 100, result: res });
          totals.inserted += res.inserted;
          totals.updated += res.updated;
          totals.skipped += res.skipped;
          totals.rejected += res.rejected;
        }
      } catch (e: any) {
        updateFile(item.id, { status: 'failed', error: e.message });
      }
    }

    setIsRunning(false);
    setCurrentIndex(-1);
    toast({
      title: 'All imports complete',
      description: `${totals.inserted} inserted, ${totals.updated} updated, ${totals.skipped} skipped, ${totals.rejected} rejected`,
    });
  };

  return (
    <ImportContext.Provider value={{
      files, importType, isRunning, currentIndex,
      setImportType, addFiles, removeFile, clearAll, startImport,
    }}>
      {children}
    </ImportContext.Provider>
  );
}
