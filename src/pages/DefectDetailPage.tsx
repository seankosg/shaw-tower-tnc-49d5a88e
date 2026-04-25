import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SuggestField } from '@/components/ui/suggest-field';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useDefectFieldConfig } from '@/hooks/useDefectFieldConfig';
import { daysDiff } from '@/lib/defect-parser';
import { computeDefectStatuses } from '@/lib/defect-status';
import { computePlannedProgressPct } from '@/lib/defect-progress-calc';
import { DEFECT_RESPONSIBILITY_FIELDS, DEFECT_REVISION_FIELDS, DEFECT_STATUS_VALUES, type DefectEditScope, type DefectItem, formatPct, normalizeSubcontractorIssueNo, extractOwnerCodeFromIssueNo, buildNextSubcontractorIssueNo, parseSubcontractorIssueSequence } from '@/lib/defect-utils';
import { classifyDefect, type ClassificationRule, type DisciplineFallback } from '@/lib/defect-classifier';
import { formatDateTimeDdMmmYyyy, formatDdMmmYyyy } from '@/lib/format';
import { ALL_TEAMS, TEAM_LABELS } from '@/types/enums';

type SubMaster = { id: string; name: string; parent_subcontractor_id: string | null };
type HdecMaster = { name: string };

const RAW_FIELD_LABELS = {
  item_description: 'Item Description',
  work_type: 'Work Type',
  captured_on: 'Captured on',
  start_date: 'Start Date',
  finish_date: 'Finish Date',
  actual_start_date: 'Actual Start Date',
  actual_finish_date: 'Actual Finish Date',
  planned_progress: 'Planned Progress',
} as const;

export default function DefectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [record, setRecord] = useState<DefectItem | null>(null);
  const [form, setForm] = useState<Partial<DefectItem>>({});
  const [scope, setScope] = useState<DefectEditScope>('none');
  const [logs, setLogs] = useState<any[]>([]);
  const [scHistory, setScHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [subOptions, setSubOptions] = useState<SubMaster[]>([]);
  const [subsubOptions, setSubsubOptions] = useState<SubMaster[]>([]);
  const [hdecOptions, setHdecOptions] = useState<HdecMaster[]>([]);
  const [hdecEngOptions, setHdecEngOptions] = useState<HdecMaster[]>([]);
  const [suggestPool, setSuggestPool] = useState<{ area_level: string[]; area_location: string[]; main_trade: string[]; sub_trade: string[]; work_type: string[] }>({ area_level: [], area_location: [], main_trade: [], sub_trade: [], work_type: [] });
  const { isFieldVisible, isFieldRequired, getLabel } = useDefectFieldConfig();

  const loadScHistory = async (defectId: string) => {
    const res = await (supabase as any)
      .from('sc_no_history')
      .select('*')
      .eq('defect_id', defectId)
      .order('changed_at', { ascending: false })
      .limit(10);
    setScHistory(res.data ?? []);
  };

  useEffect(() => {
    if (!id) return;
    async function load() {
      const { data } = await (supabase as any).from('defect_items').select('*').eq('id', id).single();
      setRecord(data);
      setForm(data ? hydrateDetailForm(data) : {});
      if (user) {
        const scopeRes = await (supabase as any).rpc('get_defect_edit_scope', { _user_id: user.id, _defect_id: id });
        setScope((scopeRes.data as DefectEditScope) ?? 'none');
      }
      const logRes = await (supabase as any).from('defect_change_log').select('*').eq('defect_id', id).order('changed_at', { ascending: false }).limit(50);
      setLogs(logRes.data ?? []);
      await loadScHistory(id);
    }
    load();
  }, [id, user]);

  useEffect(() => {
    async function loadMasters() {
      const [subRes, hdecRes, hdecEngRes] = await Promise.all([
        (supabase as any).from('subcontractor_master').select('id, name, parent_subcontractor_id, type').eq('is_active', true).order('name'),
        (supabase as any).from('hdec_pic_master').select('name').eq('is_active', true).order('name'),
        (supabase as any).from('hdec_eng_master').select('name').eq('is_active', true).order('name'),
      ]);
      const allSubs = (subRes.data ?? []) as Array<SubMaster & { type: string }>;
      setSubOptions(allSubs.filter((r) => r.type === 'sub').map(({ id, name, parent_subcontractor_id }) => ({ id, name, parent_subcontractor_id })));
      setSubsubOptions(allSubs.filter((r) => r.type === 'subsub').map(({ id, name, parent_subcontractor_id }) => ({ id, name, parent_subcontractor_id })));
      setHdecOptions((hdecRes.data ?? []) as HdecMaster[]);
      setHdecEngOptions((hdecEngRes.data ?? []) as HdecMaster[]);
    }
    loadMasters();
  }, []);

  // Pull existing distinct values for free-text fields, scoped to current project,
  // to power Combobox suggestions while still allowing free-text entry.
  useEffect(() => {
    if (!record?.project_id) return;
    let cancelled = false;
    async function loadSuggestions() {
      const { data } = await (supabase as any)
        .from('defect_items')
        .select('area_level, area_location, main_trade, sub_trade, work_type')
        .eq('project_id', record!.project_id)
        .eq('is_active', true)
        .limit(5000);
      if (cancelled) return;
      const collect = (key: 'area_level' | 'area_location' | 'main_trade' | 'sub_trade' | 'work_type') => {
        const set = new Set<string>();
        for (const row of (data ?? []) as any[]) {
          const v = (row?.[key] ?? '').toString().trim();
          if (v) set.add(v);
        }
        return Array.from(set);
      };
      setSuggestPool({
        area_level: collect('area_level'),
        area_location: collect('area_location'),
        main_trade: collect('main_trade'),
        sub_trade: collect('sub_trade'),
        work_type: collect('work_type'),
      });
    }
    loadSuggestions();
    return () => { cancelled = true; };
  }, [record?.project_id]);

  const canEdit = scope !== 'none';
  const canEditResponsibility = scope === 'team' || scope === 'full';

  const updateField = (field: keyof DefectItem, value: any) => setForm((current) => {
    const next: any = { ...current, [field]: value };
    if (field === 'planned_start_date' || field === 'planned_completion_date') {
      const today = new Date().toISOString().slice(0, 10);
      next.planned_progress_pct = computePlannedProgressPct(
        next.planned_start_date ?? null,
        next.planned_completion_date ?? null,
        today,
      );
    }
    return next;
  });

  const revisionPayload = (field: string, before: any, after: any) => ({
    defect_id: record!.id, project_id: record!.project_id, issue_no: record!.issue_no, subcontractor_issue_no: form.subcontractor_issue_no ?? record!.subcontractor_issue_no,
    planned_start_old_date: field === 'planned_start_date' ? before : null, planned_start_new_date: field === 'planned_start_date' ? after : null, planned_start_diff_days: field === 'planned_start_date' ? daysDiff(before, after) : null,
    planned_completion_old_date: field === 'planned_completion_date' ? before : null, planned_completion_new_date: field === 'planned_completion_date' ? after : null, planned_completion_diff_days: field === 'planned_completion_date' ? daysDiff(before, after) : null,
    planned_closure_old_date: field === 'planned_closure_date' ? before : null, planned_closure_new_date: field === 'planned_closure_date' ? after : null, planned_closure_diff_days: field === 'planned_closure_date' ? daysDiff(before, after) : null,
    actual_start_old_date: field === 'actual_start_date' ? before : null, actual_start_new_date: field === 'actual_start_date' ? after : null, actual_start_diff_days: field === 'actual_start_date' ? daysDiff(before, after) : null,
    actual_completion_old_date: field === 'actual_completion_date' ? before : null, actual_completion_new_date: field === 'actual_completion_date' ? after : null, actual_completion_diff_days: field === 'actual_completion_date' ? daysDiff(before, after) : null,
    actual_closure_old_date: field === 'actual_closure_date' ? before : null, actual_closure_new_date: field === 'actual_closure_date' ? after : null, actual_closure_diff_days: field === 'actual_closure_date' ? daysDiff(before, after) : null,
    planned_progress_old_pct: field === 'planned_progress_pct' ? before : null, planned_progress_new_pct: field === 'planned_progress_pct' ? after : null, planned_progress_diff_pct: field === 'planned_progress_pct' ? Number(after ?? 0) - Number(before ?? 0) : null,
    progress_old_pct: field === 'actual_progress_pct' ? before : null, progress_new_pct: field === 'actual_progress_pct' ? after : null, progress_diff_pct: field === 'actual_progress_pct' ? Number(after ?? 0) - Number(before ?? 0) : null,
    completion_status_old: field === 'completion_status' ? before : null, completion_status_new: field === 'completion_status' ? after : null,
    closure_status_old: field === 'closure_status' ? before : null, closure_status_new: field === 'closure_status' ? after : null,
    created_by: user?.id, change_source: 'app_direct_input',
  });

  const handleSave = async () => {
    if (!record || !user || !canEdit) return;
    setSaving(true);

    const rawFieldKeys = ['item_description', 'work_type', 'captured_on', 'start_date', 'finish_date', 'actual_start_date', 'actual_finish_date', 'planned_progress'] as const;
    const editableFields = [
      'subcontractor_issue_no', 'subcontractor_issue_source',
      'area_type', 'area_level', 'area_location',
      'main_trade', 'sub_trade', 'trade_detail', 'work_type',
      'planned_start_date', 'planned_completion_date', 'planned_closure_date',
      'actual_start_date', 'actual_completion_date', 'actual_closure_date',
      'planned_progress_pct', 'actual_progress_pct', 'completion_status', 'closure_status',
      'description', 'remarks',
      'subcontractor_name', 'subsub_name', 'hdec_pic_name', 'hdec_eng_name', 'team',
    ] as const;

    const changes = editableFields
      .filter((field) => canEditResponsibility || (!DEFECT_RESPONSIBILITY_FIELDS.includes(field as any) && field !== 'team'))
      .filter((field) => String((record as any)[field] ?? '') !== String((form as any)[field] ?? ''))
      .map((field) => ({ field, oldValue: (record as any)[field], newValue: (form as any)[field] }));
    const rawChanges = rawFieldKeys
      .filter((field) => String(getRawValue(record.raw_payload, [RAW_FIELD_LABELS[field]]) ?? '') !== String((form as any)[field] ?? ''))
      .map((field) => ({ field: RAW_FIELD_LABELS[field], oldValue: getRawValue(record.raw_payload, [RAW_FIELD_LABELS[field]]), newValue: (form as any)[field] }));

    // --- SC No reassignment logic --------------------------------------------------
    // 1. If user typed an SC No directly, that takes priority (source='manual').
    // 2. Else, if the subcontractor changed and its owner_code differs from the current
    //    SC No's embedded code, auto-reissue with new owner's next sequence
    //    (source='reassigned'). Same owner → keep existing number.
    const userTypedScNo = normalizeSubcontractorIssueNo(form.subcontractor_issue_no);
    const existingScNo = normalizeSubcontractorIssueNo(record.subcontractor_issue_no);
    const userEditedScNoDirectly = userTypedScNo !== existingScNo;
    const subcontractorChanged = canEditResponsibility
      && (form.subcontractor_name ?? null) !== (record.subcontractor_name ?? null);

    let resolvedScNo: string | null = userTypedScNo;
    let resolvedScSource: string | null = userEditedScNoDirectly
      ? 'manual'
      : (form.subcontractor_issue_source || record.subcontractor_issue_source || null);
    let reassignment: null | {
      oldScNo: string | null;
      newScNo: string;
      oldOwner: string | null;
      newOwner: string;
      oldSubcontractor: string | null;
      newSubcontractor: string | null;
    } = null;

    if (!userEditedScNoDirectly && subcontractorChanged) {
      const newSubName = (form.subcontractor_name ?? '').trim();
      let newOwnerCode: string | null = null;
      if (newSubName) {
        const { data: masterRows } = await (supabase as any)
          .from('subcontractor_master')
          .select('owner_code, type, name')
          .eq('is_active', true)
          .ilike('name', newSubName);
        const subRow = (masterRows ?? []).find((r: any) => r.type === 'sub') ?? (masterRows ?? [])[0] ?? null;
        newOwnerCode = subRow?.owner_code ? String(subRow.owner_code).toUpperCase() : null;
      }
      const normalizedNewOwner = newOwnerCode ?? 'UNASSIGNED';
      const oldOwnerCode = extractOwnerCodeFromIssueNo(existingScNo);
      if (normalizedNewOwner !== oldOwnerCode) {
        // Find max sequence for new owner from defect_items
        const { data: ownerRows } = await (supabase as any)
          .from('defect_items')
          .select('subcontractor_issue_no')
          .eq('is_active', true)
          .ilike('subcontractor_issue_no', `SC-${normalizedNewOwner}-%`);
        const maxSeq = (ownerRows ?? []).reduce((acc: number, row: any) => {
          const seq = parseSubcontractorIssueSequence(row.subcontractor_issue_no, normalizedNewOwner);
          return seq && seq > acc ? seq : acc;
        }, 0);
        const newScNo = buildNextSubcontractorIssueNo(normalizedNewOwner, maxSeq);
        resolvedScNo = newScNo;
        resolvedScSource = 'reassigned';
        reassignment = {
          oldScNo: existingScNo,
          newScNo,
          oldOwner: oldOwnerCode,
          newOwner: normalizedNewOwner,
          oldSubcontractor: record.subcontractor_name ?? null,
          newSubcontractor: form.subcontractor_name ?? null,
        };
      }
    }

    const payload: any = {
      subcontractor_issue_no: resolvedScNo,
      subcontractor_issue_source: resolvedScSource,
      area_type: form.area_type || null,
      area_level: form.area_level || null,
      area_location: form.area_location || null,
      main_trade: form.main_trade || null,
      sub_trade: form.sub_trade || null,
      trade_detail: form.trade_detail || null,
      work_type: form.work_type || null,
      planned_start_date: form.planned_start_date || null,
      planned_completion_date: form.planned_completion_date || null,
      planned_closure_date: form.planned_closure_date || null,
      actual_start_date: form.actual_start_date || null,
      actual_completion_date: Number(form.actual_progress_pct ?? 0) >= 100 ? (form.actual_completion_date || record.actual_completion_date || new Date().toISOString().slice(0, 10)) : (form.actual_completion_date || null),
      actual_closure_date: form.actual_closure_date || null,
      planned_progress_pct: computePlannedProgressPct(form.planned_start_date ?? null, form.planned_completion_date ?? null, new Date().toISOString().slice(0, 10)),
      actual_progress_pct: form.actual_progress_pct ?? null,
      completion_status: form.completion_status || null,
      closure_status: form.closure_status || null,
      description: form.description || null,
      remarks: form.remarks || null,
      hdec_eng_name: form.hdec_eng_name || null,
      classification_source: 'manual',
      classified_at: new Date().toISOString(),
      updated_by: user.id,
      data_source_type: 'app_direct_input',
      row_version: record.row_version + 1,
    };
    // Auto-recompute statuses ONLY when status-affecting inputs (dates / actual progress) actually changed.
    // Otherwise keep the existing DB values to avoid silently overwriting closure_status to "Planned"
    // when the user edited an unrelated field (description, remarks, trade, etc.).
    const userChangedCompletion = (form.completion_status ?? null) !== (record.completion_status ?? null);
    const userChangedClosure = (form.closure_status ?? null) !== (record.closure_status ?? null);
    const statusInputsChanged =
      (record.planned_start_date ?? null) !== (payload.planned_start_date ?? null) ||
      (record.planned_completion_date ?? null) !== (payload.planned_completion_date ?? null) ||
      (record.planned_closure_date ?? null) !== (payload.planned_closure_date ?? null) ||
      (record.actual_start_date ?? null) !== (payload.actual_start_date ?? null) ||
      (record.actual_completion_date ?? null) !== (payload.actual_completion_date ?? null) ||
      (record.actual_closure_date ?? null) !== (payload.actual_closure_date ?? null) ||
      (record.actual_progress_pct ?? null) !== (payload.actual_progress_pct ?? null);
    if (statusInputsChanged) {
      const asOf = new Date().toISOString().slice(0, 10);
      const auto = computeDefectStatuses({
        planned_start_date: payload.planned_start_date,
        planned_completion_date: payload.planned_completion_date,
        planned_closure_date: payload.planned_closure_date,
        actual_start_date: payload.actual_start_date,
        actual_completion_date: payload.actual_completion_date,
        actual_closure_date: payload.actual_closure_date,
        planned_progress_pct: payload.planned_progress_pct,
        actual_progress_pct: payload.actual_progress_pct,
      }, asOf);
      if (!userChangedCompletion) payload.completion_status = auto.completion_status;
      if (!userChangedClosure) payload.closure_status = auto.closure_status;
    }
    const rawPayload = { ...(record.raw_payload ?? {}) };
    for (const key of rawFieldKeys) {
      const value = (form as any)[key];
      if (value == null || value === '') delete rawPayload[RAW_FIELD_LABELS[key]];
      else rawPayload[RAW_FIELD_LABELS[key]] = value;
    }
    payload.raw_payload = rawPayload;
    if (canEditResponsibility) {
      payload.subcontractor_name = form.subcontractor_name || null;
      payload.subsub_name = form.subsub_name || null;
      payload.hdec_pic_name = form.hdec_pic_name || null;
      payload.team = form.team || null;
    }
    if (payload.subcontractor_issue_no && payload.subcontractor_issue_no !== normalizeSubcontractorIssueNo(record.subcontractor_issue_no)) {
      const { data: duplicate } = await (supabase as any)
        .from('defect_items')
        .select('id, issue_no')
        .eq('is_active', true)
        .eq('subcontractor_issue_no', payload.subcontractor_issue_no)
        .neq('id', record.id)
        .limit(1)
        .maybeSingle();
      if (duplicate) {
        setSaving(false);
        toast({ title: 'Duplicate Subcontractor Issue No', description: 'Subcontractor Issue No already exists for this owner.', variant: 'destructive' });
        return;
      }
    }
    const { error } = await (supabase as any).from('defect_items').update(payload).eq('id', record.id);
    if (error) {
      setSaving(false);
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    // If SC No was auto-reissued, ensure it's logged in defect_change_log even though
    // the form value didn't differ from record (the change happened server-side here).
    const extraChanges: { field: string; oldValue: any; newValue: any }[] = [];
    if (reassignment) {
      extraChanges.push({
        field: 'subcontractor_issue_no',
        oldValue: reassignment.oldScNo,
        newValue: reassignment.newScNo,
      });
      extraChanges.push({
        field: 'subcontractor_issue_source',
        oldValue: record.subcontractor_issue_source ?? null,
        newValue: 'reassigned',
      });
    }
    const allChanges = [...changes, ...extraChanges];
    if (allChanges.length > 0 || rawChanges.length > 0) {
      await (supabase as any).from('defect_change_log').insert([...allChanges, ...rawChanges].map(({ field, oldValue, newValue }) => ({ defect_id: record.id, changed_field: field, old_value: String(oldValue ?? ''), new_value: String(newValue ?? ''), changed_by: user.id, change_source: 'app_direct_input' })));
      for (const { field, oldValue, newValue } of changes) {
        if ((DEFECT_REVISION_FIELDS as readonly string[]).includes(field)) await (supabase as any).from('defect_schedule_change_audit').insert(revisionPayload(field, oldValue, newValue));
      }
    }
    if (reassignment) {
      await (supabase as any).from('sc_no_history').insert({
        defect_id: record.id,
        issue_no: record.issue_no,
        old_subcontractor_issue_no: reassignment.oldScNo,
        new_subcontractor_issue_no: reassignment.newScNo,
        old_subcontractor_name: reassignment.oldSubcontractor,
        new_subcontractor_name: reassignment.newSubcontractor,
        old_owner_code: reassignment.oldOwner,
        new_owner_code: reassignment.newOwner,
        reason: 'reassigned',
        changed_by: user.id,
      });
    }
    const updatedRecord = { ...record, ...payload };
    setRecord(updatedRecord);
    setForm(hydrateDetailForm(updatedRecord));
    await loadScHistory(record.id);
    const logRes = await (supabase as any).from('defect_change_log').select('*').eq('defect_id', record.id).order('changed_at', { ascending: false }).limit(50);
    setLogs(logRes.data ?? []);
    setSaving(false);
    toast({
      title: 'Saved',
      description: reassignment
        ? `SC No reassigned: ${reassignment.oldScNo ?? '—'} → ${reassignment.newScNo}`
        : 'Defect updated successfully.',
    });
  };

  const rawEntries = useMemo(() => Object.entries(record?.raw_payload ?? {}).slice(0, 80), [record]);

  // Master-driven dropdown options. Preserve legacy values that aren't in master.
  const subOptionsList = useMemo(() => {
    const names = subOptions.map((o) => o.name);
    const cur = (form.subcontractor_name ?? '').trim();
    const list = cur && !names.includes(cur) ? [{ id: '__legacy__', name: cur, parent_subcontractor_id: null }, ...subOptions] : subOptions;
    return list.map((o) => ({ value: o.name, label: o.name }));
  }, [subOptions, form.subcontractor_name]);
  const subsubOptionsList = useMemo(() => {
    const selectedSubId = subOptions.find((o) => o.name === form.subcontractor_name)?.id ?? null;
    const filtered = selectedSubId ? subsubOptions.filter((o) => o.parent_subcontractor_id === selectedSubId) : subsubOptions;
    const names = filtered.map((o) => o.name);
    const cur = (form.subsub_name ?? '').trim();
    const list = cur && !names.includes(cur) ? [{ id: '__legacy__', name: cur, parent_subcontractor_id: null }, ...filtered] : filtered;
    return list.map((o) => ({ value: o.name, label: o.name }));
  }, [subsubOptions, subOptions, form.subcontractor_name, form.subsub_name]);
  const hdecOptionsList = useMemo(() => {
    const names = hdecOptions.map((o) => o.name);
    const cur = (form.hdec_pic_name ?? '').trim();
    const list = cur && !names.includes(cur) ? [{ name: cur }, ...hdecOptions] : hdecOptions;
    return list.map((o) => ({ value: o.name, label: o.name }));
  }, [hdecOptions, form.hdec_pic_name]);
  const hdecEngOptionsList = useMemo(() => {
    const names = hdecEngOptions.map((o) => o.name);
    const cur = (form.hdec_eng_name ?? '').trim();
    const list = cur && !names.includes(cur) ? [{ name: cur }, ...hdecEngOptions] : hdecEngOptions;
    return list.map((o) => ({ value: o.name, label: o.name }));
  }, [hdecEngOptions, form.hdec_eng_name]);
  const statusOptionsList = DEFECT_STATUS_VALUES.map((s) => ({ value: s, label: s }));
  const teamOptionsList = ALL_TEAMS.map((t) => ({ value: t, label: TEAM_LABELS[t] }));

  if (!record) return <div className="text-sm text-muted-foreground">Loading defect...</div>;

  const workType = form.work_type ?? record.work_type;
  const itemDescription = (form as any).item_description ?? getRawValue(record.raw_payload, ['Issue Description', 'IssueDescription', 'Item Description', 'Description']) ?? record.description;
  const capturedOn = (form as any).captured_on ?? getRawValue(record.raw_payload, ['Captured on', 'Captured On', 'Captured Date', 'Capture Date']) ?? record.created_at;
  const startDate = (form as any).start_date ?? form.planned_start_date ?? getRawValue(record.raw_payload, ['Start', 'Start Date', 'Planned Start', 'Plan Start']);
  const finishDate = (form as any).finish_date ?? form.planned_completion_date ?? getRawValue(record.raw_payload, ['Finish', 'Finish Date', 'Planned Finish', 'Plan Finish']);
  const actualStartDate = (form as any).actual_start_date ?? getRawValue(record.raw_payload, ['Actual Start', 'Actual Start Date']);
  const actualFinishDate = (form as any).actual_finish_date ?? getRawValue(record.raw_payload, ['Actual Finish', 'Actual Finish Date']);
  const plannedProgressRaw = (form as any).planned_progress ?? getRawValue(record.raw_payload, ['Planned Progress', 'Planned Progress %', 'Plan Progress', 'Plan %']);
  const plannedProgress = parseProgress(plannedProgressRaw);
  const actualProgress = form.actual_progress_pct == null ? null : Number(form.actual_progress_pct);
  const progressDifference = plannedProgress == null || actualProgress == null ? null : actualProgress - plannedProgress;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><Button variant="outline" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/defects/raw-data'); }}>Back</Button>{canEdit && <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>}</div>
      <Card><CardHeader><CardTitle className="flex flex-wrap items-center gap-x-8 gap-y-2 text-xl">ITEM DETAIL - NO.{record.issue_no}<span className="rounded-md border bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">Closure Status: {record.closure_status || '—'}</span></CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">
        <Field field="issue_no" label={getLabel('issue_no')} value={form.issue_no} required={isFieldRequired('issue_no')} disabled onChange={(v) => updateField('issue_no', v)} />
        {isFieldVisible('subcontractor_issue_no') && (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-muted-foreground">{getLabel('subcontractor_issue_no')}{isFieldRequired('subcontractor_issue_no') ? ' *' : ''}</label>
              {(form.subcontractor_issue_source ?? record.subcontractor_issue_source) === 'reassigned' && (
                <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">Reassigned</span>
              )}
            </div>
            <Input className="h-9" value={String(form.subcontractor_issue_no ?? '')} disabled={!canEdit} onChange={(e) => updateField('subcontractor_issue_no', e.target.value)} />
          </div>
        )}
        <Field label="Item Description" value={itemDescription} disabled={!canEdit} onChange={(v) => updateField('item_description' as any, v)} />
        <SelectField label="Team" value={form.team} options={teamOptionsList} disabled={!canEditResponsibility} onChange={(v) => updateField('team', v as any)} />
        <SuggestField label="Level" value={form.area_level ?? null} options={suggestPool.area_level} disabled={!canEdit} onChange={(v) => updateField('area_level', v)} />
        <SuggestField label="Location" value={form.area_location ?? null} options={suggestPool.area_location} disabled={!canEdit} onChange={(v) => updateField('area_location', v)} />
        <SuggestField label="Main Trade" value={form.main_trade ?? null} options={suggestPool.main_trade} disabled={!canEdit} onChange={(v) => updateField('main_trade', v)} />
        <SuggestField label="Sub Trade" value={form.sub_trade ?? null} options={suggestPool.sub_trade} disabled={!canEdit} onChange={(v) => updateField('sub_trade', v)} />
        <SuggestField label="Work Type" value={(workType ?? null) as any} options={suggestPool.work_type} disabled={!canEdit} onChange={(v) => updateField('work_type', v)} />
        <ReadonlyField label="Classification Source" value={form.classification_source ?? record.classification_source} />
        <div className="md:col-span-3 flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!canEdit} onClick={async () => {
            const [rulesRes, fbRes] = await Promise.all([
              (supabase as any).from('defect_classification_rules').select('*').eq('is_active', true),
              (supabase as any).from('defect_discipline_fallback').select('*').eq('is_active', true),
            ]);
            const c = classifyDefect(
              { description: form.description ?? record.description, field_discipline: form.trade_detail ?? record.trade_detail },
              (rulesRes.data ?? []) as ClassificationRule[],
              (fbRes.data ?? []) as DisciplineFallback[],
            );
            setForm((cur) => ({ ...cur, main_trade: cur.main_trade || c.main_trade, sub_trade: cur.sub_trade || c.sub_trade, work_type: c.work_type, classification_source: c.source }));
            toast({ title: 'Auto-classified', description: `${c.source} → ${c.work_type}` });
          }}>Auto-classify from description</Button>
        </div>
        <SelectField label="Subcontractor" value={form.subcontractor_name} options={subOptionsList} disabled={!canEditResponsibility} onChange={(v) => updateField('subcontractor_name', v)} />
        <SelectField label="Sub-Sub" value={form.subsub_name} options={subsubOptionsList} disabled={!canEditResponsibility} onChange={(v) => updateField('subsub_name', v)} />
        <SelectField label="HDEC PIC" value={form.hdec_pic_name} options={hdecOptionsList} disabled={!canEditResponsibility} onChange={(v) => updateField('hdec_pic_name', v)} />
        <SelectField label="HDEC Eng" value={form.hdec_eng_name} options={hdecEngOptionsList} disabled={!canEdit} onChange={(v) => updateField('hdec_eng_name', v)} />
        <Field label="Captured on" type="date" value={toDateInput(capturedOn)} disabled={!canEdit} onChange={(v) => updateField('captured_on' as any, v)} />
        <Field label="Planned Start Date" type="date" value={toDateInput(form.planned_start_date)} disabled={!canEdit} onChange={(v) => updateField('planned_start_date', v)} />
        <Field label="Planned Completion Date" type="date" value={toDateInput(form.planned_completion_date)} disabled={!canEdit} onChange={(v) => updateField('planned_completion_date', v)} />
        <Field label="Planned Closure Date" type="date" value={toDateInput(form.planned_closure_date)} disabled={!canEdit} onChange={(v) => updateField('planned_closure_date', v)} />
        <Field label="Actual Start Date" type="date" value={toDateInput(form.actual_start_date)} disabled={!canEdit} onChange={(v) => updateField('actual_start_date', v)} />
        <Field label="Actual Completion Date" type="date" value={toDateInput(form.actual_completion_date)} disabled={!canEdit} onChange={(v) => updateField('actual_completion_date', v)} />
        <Field label="Actual Closure Date" type="date" value={toDateInput(form.actual_closure_date)} disabled={!canEdit} onChange={(v) => updateField('actual_closure_date', v)} />
        <ReadonlyField label="Planned Progress % (auto from Planned Start/Completion and today)" value={form.planned_progress_pct == null ? null : formatPct(form.planned_progress_pct)} />
        <Field label="Actual Progress %" type="number" value={form.actual_progress_pct} disabled={!canEdit} onChange={(v) => updateField('actual_progress_pct', v === '' ? null : Number(v))} />
        <ReadonlyField label="Difference" value={progressDifference == null ? null : formatPct(progressDifference)} />
        <SelectField label="Completion Status" value={form.completion_status} options={statusOptionsList} disabled={!canEdit} onChange={(v) => updateField('completion_status', v)} />
        <SelectField label="Closure Status" value={form.closure_status} options={statusOptionsList} disabled={!canEdit} onChange={(v) => updateField('closure_status', v)} />
        <div className="md:col-span-3 space-y-1"><label className="text-xs font-medium text-muted-foreground">Description</label><Textarea value={String(form.description ?? '')} disabled={!canEdit} onChange={(e) => updateField('description', e.target.value)} /></div>
        <div className="md:col-span-3 space-y-1"><label className="text-xs font-medium text-muted-foreground">Remarks</label><Textarea value={String(form.remarks ?? '')} disabled={!canEdit} onChange={(e) => updateField('remarks', e.target.value)} /></div>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Raw Payload</CardTitle></CardHeader><CardContent><div className="grid gap-2 md:grid-cols-2"><div className="rounded-md border p-2 text-xs"><div className="text-muted-foreground">Subcon Issue Source</div><div className="font-medium">{String(form.subcontractor_issue_source || '—')}</div></div>{rawEntries.filter(([k]) => !isRawAlias(k, ['Issue Description', 'IssueDescription', 'Item Description', 'Description'])).map(([k, v]) => <div key={k} className="rounded-md border p-2 text-xs"><div className="text-muted-foreground">{k.replace(/\s*\(H\)\s*$/i, '')}</div><div className="font-medium">{String(v || '—')}</div></div>)}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Change History</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Old</TableHead><TableHead>New</TableHead><TableHead>Changed At</TableHead></TableRow></TableHeader><TableBody>{logs.map((log) => <TableRow key={log.id}><TableCell>{log.changed_field}</TableCell><TableCell>{formatMaybeDate(log.old_value)}</TableCell><TableCell>{formatMaybeDate(log.new_value)}</TableCell><TableCell>{formatDateTimeDdMmmYyyy(log.changed_at)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
      <Card>
        <CardHeader><CardTitle>Subcontractor Issue No History</CardTitle></CardHeader>
        <CardContent>
          {scHistory.length === 0 ? (
            <div className="text-sm text-muted-foreground">No reassignment history.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Old SC No</TableHead>
                  <TableHead>New SC No</TableHead>
                  <TableHead>Old Subcontractor</TableHead>
                  <TableHead>New Subcontractor</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scHistory.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTimeDdMmmYyyy(row.changed_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{row.old_subcontractor_issue_no ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.new_subcontractor_issue_no ?? '—'}</TableCell>
                    <TableCell>{row.old_subcontractor_name ?? '—'}</TableCell>
                    <TableCell>{row.new_subcontractor_name ?? '—'}</TableCell>
                    <TableCell>{row.reason ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comments
            {commentCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-muted text-xs font-medium px-2 py-0.5">
                {commentCount}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DefectComments
            defectId={record.id}
            defectTeam={record.team ?? null}
            onCountChange={setCommentCount}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, disabled, type = 'text', required }: { field?: string; label: string; value: any; onChange: (value: string) => void; disabled?: boolean; type?: string; required?: boolean }) {
  return <div className="space-y-1"><label className="text-xs font-medium text-muted-foreground">{label}{required ? ' *' : ''}</label><Input className="h-9" type={type} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} /></div>;
}

const NONE_TOKEN = '__none__';

function SelectField({ label, value, options, onChange, disabled, required }: { label: string; value: any; options: { value: string; label: string }[]; onChange: (value: string | null) => void; disabled?: boolean; required?: boolean }) {
  const current = value == null || value === '' ? NONE_TOKEN : String(value);
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}{required ? ' *' : ''}</label>
      <Select value={current} onValueChange={(v) => onChange(v === NONE_TOKEN ? null : v)} disabled={disabled}>
        <SelectTrigger className={`h-9 ${disabled ? 'bg-muted text-foreground' : ''}`}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent className="max-h-72 bg-popover">
          <SelectItem value={NONE_TOKEN}>— None —</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-foreground">
        {value == null || value === '' ? '—' : String(value)}
      </div>
    </div>
  );
}

function normalizeRawKey(value: string) {
  return value.replace(/\s*\(H\)\s*$/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function getRawValue(payload: Record<string, unknown> | undefined, aliases: string[]) {
  if (!payload) return null;
  const aliasSet = new Set(aliases.map(normalizeRawKey));
  const key = Object.keys(payload).find((item) => aliasSet.has(normalizeRawKey(item)));
  return key ? payload[key] : null;
}

function isRawAlias(key: string, aliases: string[]) {
  return aliases.map(normalizeRawKey).includes(normalizeRawKey(key));
}

function hydrateDetailForm(record: DefectItem) {
  return {
    ...record,
    item_description: getRawValue(record.raw_payload, ['Issue Description', 'IssueDescription', 'Item Description', 'Description']) ?? record.description,
    captured_on: getRawValue(record.raw_payload, ['Captured on', 'Captured On', 'Captured Date', 'Capture Date']) ?? record.created_at,
    actual_start_date: getRawValue(record.raw_payload, ['Actual Start', 'Actual Start Date']),
    actual_finish_date: getRawValue(record.raw_payload, ['Actual Finish', 'Actual Finish Date']),
    planned_progress: getRawValue(record.raw_payload, ['Planned Progress', 'Planned Progress %', 'Plan Progress', 'Plan %']),
  } as Partial<DefectItem> & Record<string, unknown>;
}

function toDateInput(value: unknown) {
  if (value == null || value === '') return '';
  const text = String(value);
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text)?.[1];
  if (iso) return iso;
  const d = new Date(text);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function formatMaybeDate(value: unknown) {
  if (typeof value !== 'string') return value == null || value === '' ? '—' : String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? formatDdMmmYyyy(value) : (value || '—');
}

function parseProgress(value: unknown) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}
