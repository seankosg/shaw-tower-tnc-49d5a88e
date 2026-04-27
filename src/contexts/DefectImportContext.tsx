import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { daysDiff, getDefectExcelHeaders, getDefectExcelSheetNames, parseDefectExcel, type ParsedDefectRow } from '@/lib/defect-parser';
import { createDefectMasterEnsurer } from '@/lib/defect-master-autocreate';
import { generateSubcontractorIssueNo, normalizeSubcontractorIssueNo, suggestOwnerCode } from '@/lib/defect-utils';
import { isValidDefectStatus, reconcileClosureCompletion } from '@/lib/defect-status';
import { computePlannedProgressPct } from '@/lib/defect-progress-calc';
import { classifyDefect, type ClassificationRule, type DisciplineFallback } from '@/lib/defect-classifier';
import { findSimilarMasterName, masterNameKey } from '@/lib/master-name-match';
import { normalizeTeamValue, type TeamType } from '@/types/enums';

const trackedFields = ['planned_start_date', 'planned_completion_date', 'planned_closure_date', 'actual_start_date', 'actual_completion_date', 'actual_closure_date', 'planned_progress_pct', 'actual_progress_pct', 'completion_status', 'closure_status'] as const;

/**
 * Fields where "blank in Excel = keep existing DB value" policy applies.
 * Excluded (handled separately):
 *   - planned_progress_pct, actual_completion_date, completion_status, closure_status (auto-computed)
 *   - team, subcontractor_issue_no/source, classification_source/classified_at (system-resolved)
 *   - main_trade, sub_trade, work_type (handled by classifier with the same 3-tier rule)
 *   - id, issue_no, project_id, raw_payload, source_upload_id, data_source_type, updated_by, row_version
 */
const PRESERVE_BLANK_FIELDS = [
  'description', 'defect_type', 'status', 'priority',
  'area_raw', 'area_type', 'area_level', 'area_location',
  'trade_detail',
  'subcontractor_name', 'subsub_name', 'hdec_pic_name', 'hdec_eng_name',
  'planned_start_date', 'planned_completion_date', 'planned_closure_date',
  'actual_start_date', 'actual_closure_date',
  'actual_progress_pct',
  'remarks', 'hdec_comments',
] as const;

function isBlankValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

/** For each PRESERVE_BLANK_FIELDS: if Excel value is blank and existing DB has a value,
 *  keep the existing DB value (do not overwrite with null). Mutates `row` in place. */
function preserveExistingForBlank(row: ParsedDefectRow, existing: any | null): void {
  if (!existing) return;
  for (const field of PRESERVE_BLANK_FIELDS) {
    const current = (row as any)[field];
    if (isBlankValue(current) && existing[field] != null) {
      (row as any)[field] = existing[field];
    }
  }
}

export type DefectFileStatus = 'pending' | 'parsing' | 'pending_sheet_selection' | 'ready' | 'processing' | 'done' | 'failed';

export interface DefectImportFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: DefectFileStatus;
  parsed?: ParsedDefectRow[];
  parsedCount: number;
  progress: number;
  error?: string;
  headerCount?: number;
  dataDate?: string;
  /** True when the parsed file carries the SHAW_DEFECT_REIMPORT_V1 marker.
   *  In that case the importer runs in update-only mode and never inserts new rows. */
  isReimport?: boolean;
  /** All sheet names in the workbook. Set when 2+ sheets exist. */
  sheetNames?: string[];
  /** Currently selected sheet (set after user picks, or auto-set when only 1 sheet). */
  selectedSheet?: string;
  /** All raw header strings present in the chosen sheet (for column-select dialog). */
  availableHeaders?: string[];
  /** First data row (header → value) used as preview in column-select dialog. */
  headerSamples?: Record<string, unknown>;
  /** User-excluded raw headers — re-parsed on change. Default: []. */
  excludedHeaders?: string[];
  /** Canonical field names excluded from this import (derived from excludedHeaders).
   *  Importer skips change-detection / audit / payload work for these fields, so
   *  selecting fewer columns directly speeds up the import. */
  excludedFields?: Set<string>;
  result?: { inserted: number; updated: number; skipped: number; rejected: number; teamUnresolved: number; classifiedRule: number; classifiedDiscipline: number; unclassified: number };
}

export type SimilarDecisionAction = 'use_existing' | 'register_new';
export type SimilarMasterDecision = {
  key: string;
  kind: 'subcontractor' | 'subsub';
  importedName: string;
  existingName: string;
  parentName?: string | null;
  score: number;
  action?: SimilarDecisionAction;
};

export type MasterNameDecisions = Record<string, SimilarMasterDecision>;
type OwnerMaster = { name: string; type: string | null; parent_subcontractor_id: string | null; owner_code: string | null };
/** Lightweight registry — counters now live in the database (subcontractor_issue_counters). */
type IssueRegistry = { masters: OwnerMaster[] };

function changed(a: unknown, b: unknown) {
  return String(a ?? '') !== String(b ?? '');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type ProfileTeamMap = Map<string, TeamType>;

async function buildProfileTeamMap(): Promise<ProfileTeamMap> {
  const { data } = await (supabase as any)
    .from('profiles')
    .select('subcontractor_name, subsub_name, hdec_eng_name, team')
    .eq('is_active', true);
  const buckets = new Map<string, Set<TeamType>>();

  for (const profile of data ?? []) {
    const team = normalizeTeamValue(profile.team);
    if (!team) continue;
    for (const name of [profile.subcontractor_name, profile.subsub_name, profile.hdec_eng_name]) {
      const key = masterNameKey(name);
      if (!key) continue;
      if (!buckets.has(key)) buckets.set(key, new Set<TeamType>());
      buckets.get(key)!.add(team);
    }
  }

  return new Map([...buckets.entries()].filter(([, teams]) => teams.size === 1).map(([key, teams]) => [key, [...teams][0]]));
}

function resolveDefectTeam(row: ParsedDefectRow, profileTeamMap: ProfileTeamMap): TeamType | null {
  // Unified rule (initial import + re-import):
  //   1. If the Excel row has an explicit Team value, use it as-is.
  //   2. Otherwise fall back to deriving Team from Field Discipline / profiles.
  // Users can still edit the Team in the app subject to role permissions.
  const explicit = normalizeTeamValue(row.team);
  if (explicit) return explicit;
  return normalizeTeamValue(row.trade_detail)
    ?? profileTeamMap.get(masterNameKey(row.subcontractor_name))
    ?? profileTeamMap.get(masterNameKey(row.subsub_name))
    ?? profileTeamMap.get(masterNameKey((row as any).hdec_eng_name))
    ?? null;
}

function issueKey(projectId: string | null | undefined, issueNo: string | null | undefined) {
  const normalized = normalizeSubcontractorIssueNo(issueNo);
  return normalized ? `${projectId ?? ''}::${normalized.toLowerCase()}` : null;
}

function resolveOwnerCode(row: Pick<ParsedDefectRow, 'subcontractor_name' | 'subsub_name' | 'team'>, masters: OwnerMaster[]): string {
  const subsubKey = masterNameKey(row.subsub_name);
  const subKey = masterNameKey(row.subcontractor_name);
  const subsub = masters.find((master) => master.type === 'subsub' && masterNameKey(master.name) === subsubKey);
  const sub = masters.find((master) => (master.type ?? 'sub') === 'sub' && masterNameKey(master.name) === subKey);
  return (subsub?.owner_code || sub?.owner_code || normalizeTeamValue(row.team) || 'UNASSIGNED').toUpperCase();
}

/** Loads only the owner-master list. SC sequence allocation is handled atomically by
 *  the database RPC `allot_subcontractor_issue_no`, removing all client-side race
 *  conditions. */
async function buildIssueRegistry(): Promise<IssueRegistry> {
  const { data: masters } = await (supabase as any)
    .from('subcontractor_master')
    .select('name, type, parent_subcontractor_id, owner_code')
    .eq('is_active', true);
  return { masters: (masters ?? []) as OwnerMaster[] };
}

const issueNoCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function compareIssueNoAsc(a: string | null | undefined, b: string | null | undefined): number {
  const aStr = String(a ?? '').trim();
  const bStr = String(b ?? '').trim();
  if (!aStr && !bStr) return 0;
  if (!aStr) return 1;
  if (!bStr) return -1;
  return issueNoCollator.compare(aStr, bStr);
}

export function detectIssueNoSortDirection(rows: Pick<ParsedDefectRow, 'issue_no'>[]): 'asc' | 'desc' {
  const issueNos = rows.map((row) => String(row.issue_no ?? '').trim()).filter((value) => value.length > 0);
  if (issueNos.length < 2) return 'asc';
  let asc = 0;
  let desc = 0;
  for (let i = 1; i < issueNos.length; i++) {
    const cmp = issueNoCollator.compare(issueNos[i - 1], issueNos[i]);
    if (cmp < 0) asc++;
    else if (cmp > 0) desc++;
  }
  return desc > asc ? 'desc' : 'asc';
}

export interface IssueAssignment {
  subcontractor_issue_no: string | null;
  subcontractor_issue_source: string | null;
  duplicate: boolean;
}

/** Assign SC numbers for every parsed row using the DB-backed counter:
 *  1. Existing rows keep their current SC number.
 *  2. Manually-typed SC numbers are validated and the counter is bumped via RPC.
 *  3. Auto-generated rows are grouped by owner_code, sorted by issue_no,
 *     and a single `allot_subcontractor_issue_no(project, owner, N)` RPC
 *     reserves N atomic sequences per owner. */
export async function buildSubcontractorIssueAssignments(
  rows: ParsedDefectRow[],
  projectId: string,
  registry: IssueRegistry,
  existingByIssueNo: Map<string, { subcontractor_issue_no?: string | null; subcontractor_issue_source?: string | null }>,
): Promise<Map<number, IssueAssignment>> {
  const assignments = new Map<number, IssueAssignment>();
  const autoGenByOwner = new Map<string, ParsedDefectRow[]>();
  const manualBumps = new Map<string, number>(); // owner_code -> max manual seq seen this batch

  for (const row of rows) {
    if (!row.issue_no) continue;
    const existing = existingByIssueNo.get(row.issue_no);
    if (existing?.subcontractor_issue_no) {
      assignments.set(row.rawRowNo, {
        subcontractor_issue_no: normalizeSubcontractorIssueNo(existing.subcontractor_issue_no),
        subcontractor_issue_source: existing.subcontractor_issue_source ?? null,
        duplicate: false,
      });
      continue;
    }
    const imported = normalizeSubcontractorIssueNo(row.subcontractor_issue_no);
    if (imported) {
      assignments.set(row.rawRowNo, {
        subcontractor_issue_no: imported,
        subcontractor_issue_source: 'imported',
        duplicate: false,
      });
      // Track manual SC numbers so we can lift the DB counter once per owner.
      const m = /^SC-([A-Z0-9]+)-(\d+)$/i.exec(imported);
      if (m) {
        const owner = m[1].toUpperCase();
        const seq = Number(m[2]);
        if (Number.isFinite(seq) && seq > 0) {
          manualBumps.set(owner, Math.max(manualBumps.get(owner) ?? 0, seq));
        }
      }
      continue;
    }
    const ownerCode = resolveOwnerCode(row, registry.masters)
      || suggestOwnerCode(row.subsub_name ?? row.subcontractor_name ?? row.team);
    const list = autoGenByOwner.get(ownerCode) ?? [];
    list.push(row);
    autoGenByOwner.set(ownerCode, list);
  }

  // 1) Bump counters for manually typed SC numbers (one RPC per owner).
  await Promise.all(
    [...manualBumps.entries()].map(([owner, used]) =>
      (supabase as any).rpc('bump_subcontractor_issue_counter', {
        _project_id: projectId,
        _owner_code: owner,
        _used_seq: used,
      })
    )
  );

  // 2) Allocate sequences atomically per owner via RPC, in issue_no asc order.
  for (const [ownerCode, group] of autoGenByOwner) {
    const sortedGroup = [...group].sort((a, b) => compareIssueNoAsc(a.issue_no, b.issue_no));
    const { data, error } = await (supabase as any).rpc('allot_subcontractor_issue_no', {
      _project_id: projectId,
      _owner_code: ownerCode,
      _count: sortedGroup.length,
    });
    if (error || !Array.isArray(data) || data.length !== sortedGroup.length) {
      throw new Error(`Failed to allocate SC numbers for owner ${ownerCode}: ${error?.message ?? 'unexpected RPC response'}`);
    }
    sortedGroup.forEach((row, idx) => {
      const seq = Number(data[idx]);
      assignments.set(row.rawRowNo, {
        subcontractor_issue_no: generateSubcontractorIssueNo(ownerCode, seq),
        subcontractor_issue_source: 'auto_generated',
        duplicate: false,
      });
    });
  }

  return assignments;
}

interface DefectImportContextValue {
  files: DefectImportFile[];
  isRunning: boolean;
  similarDecisions: SimilarMasterDecision[];
  addFiles: (selected: File[]) => Promise<void>;
  removeFile: (id: string) => void;
  clearAll: () => void;
  setFileDataDate: (id: string, dataDate: string) => void;
  setFileSheet: (id: string, sheetName: string) => Promise<void>;
  setFileExcludedHeaders: (id: string, excluded: string[]) => Promise<void>;
  startImport: () => Promise<void>;
  setDecisionAction: (key: string, action: SimilarDecisionAction) => void;
  confirmSimilarDecisions: () => Promise<void>;
  cancelSimilarDecisions: () => void;
}

const DefectImportContext = createContext<DefectImportContextValue | null>(null);

export function useDefectImport() {
  const ctx = useContext(DefectImportContext);
  if (!ctx) throw new Error('useDefectImport must be used within DefectImportProvider');
  return ctx;
}

export function DefectImportProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<DefectImportFile[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [similarDecisions, setSimilarDecisions] = useState<SimilarMasterDecision[]>([]);
  const [pendingImportFiles, setPendingImportFiles] = useState<DefectImportFile[] | null>(null);
  const [confirmedDecisions, setConfirmedDecisions] = useState<MasterNameDecisions>({});

  /** Parse a defect file (optionally with explicit sheet + excluded headers) and update file state. */
  const parseAndApply = useCallback(async (id: string, file: File, sheetName?: string, excludedHeaders?: string[]) => {
    try {
      const parsed = await parseDefectExcel(file, sheetName, excludedHeaders);
      setFiles((current) => current.map((f) => f.id === id ? {
        ...f,
        status: 'ready',
        parsed: parsed.rows,
        parsedCount: parsed.rows.length,
        headerCount: parsed.headers.length,
        isReimport: parsed.isReimport,
        selectedSheet: parsed.sheetName ?? sheetName,
        excludedFields: parsed.excludedFields,
        error: undefined,
      } : f));
    } catch (error) {
      setFiles((current) => current.map((f) => f.id === id ? { ...f, status: 'failed', error: error instanceof Error ? error.message : 'Parse failed' } : f));
    }
  }, []);

  const addFiles = useCallback(async (selected: File[]) => {
    const excelFiles = selected.filter((file) => /\.(xlsx|xls)$/i.test(file.name));
    const nextFiles: DefectImportFile[] = excelFiles.map((file) => ({
      id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
      file,
      name: file.name,
      size: file.size,
      status: 'parsing',
      parsedCount: 0,
      progress: 0,
      dataDate: todayIso(),
    }));
    setFiles((current) => [...current, ...nextFiles]);

    for (const item of nextFiles) {
      try {
        const sheetNames = await getDefectExcelSheetNames(item.file);
        setFiles((current) => current.map((f) => f.id === item.id ? { ...f, sheetNames } : f));

        if (sheetNames.length > 1) {
          // Multiple sheets — wait for user to pick one
          setFiles((current) => current.map((f) => f.id === item.id ? { ...f, status: 'pending_sheet_selection' } : f));
          continue;
        }
        // 0 or 1 sheet — auto-detect (legacy behavior). Capture headers for column-select dialog.
        const headerInfo = await getDefectExcelHeaders(item.file);
        if (headerInfo) {
          setFiles((current) => current.map((f) => f.id === item.id ? {
            ...f,
            availableHeaders: headerInfo.headers,
            headerSamples: headerInfo.sample,
            isReimport: headerInfo.isReimport,
            excludedHeaders: [],
          } : f));
        }
        await parseAndApply(item.id, item.file);
      } catch (error) {
        setFiles((current) => current.map((f) => f.id === item.id ? { ...f, status: 'failed', error: error instanceof Error ? error.message : 'Parse failed' } : f));
      }
    }
  }, [parseAndApply]);

  const removeFile = useCallback((id: string) => setFiles((current) => current.filter((file) => file.id !== id)), []);
  const clearAll = useCallback(() => setFiles([]), []);
  const setFileDataDate = useCallback((id: string, dataDate: string) => setFiles((current) => current.map((file) => file.id === id ? { ...file, dataDate } : file)), []);

  const setFileSheet = useCallback(async (id: string, sheetName: string) => {
    let target: DefectImportFile | undefined;
    setFiles((current) => {
      target = current.find((f) => f.id === id);
      // Sheet change → headers may differ → reset excludedHeaders.
      return current.map((f) => f.id === id ? {
        ...f,
        status: 'parsing',
        selectedSheet: sheetName,
        excludedHeaders: [],
        availableHeaders: undefined,
        headerSamples: undefined,
      } : f);
    });
    if (!target) return;
    // Re-extract headers for the newly selected sheet.
    const headerInfo = await getDefectExcelHeaders(target.file, sheetName);
    if (headerInfo) {
      setFiles((current) => current.map((f) => f.id === id ? {
        ...f,
        availableHeaders: headerInfo.headers,
        headerSamples: headerInfo.sample,
        isReimport: headerInfo.isReimport,
      } : f));
    }
    await parseAndApply(id, target.file, sheetName);
  }, [parseAndApply]);

  const setFileExcludedHeaders = useCallback(async (id: string, excluded: string[]) => {
    let target: DefectImportFile | undefined;
    setFiles((current) => {
      target = current.find((f) => f.id === id);
      return current.map((f) => f.id === id ? { ...f, status: 'parsing', excludedHeaders: excluded } : f);
    });
    if (!target) return;
    await parseAndApply(id, target.file, target.selectedSheet, excluded);
  }, [parseAndApply]);

  const applyMasterDecisions = (row: ParsedDefectRow, decisions: MasterNameDecisions): ParsedDefectRow => {
    const subKey = `sub:${masterNameKey(row.subcontractor_name)}`;
    const mappedSub = decisions[subKey]?.action === 'use_existing' ? decisions[subKey].existingName : row.subcontractor_name;
    const subsubKey = `subsub:${masterNameKey(mappedSub)}::${masterNameKey(row.subsub_name)}`;
    const mappedSubsub = decisions[subsubKey]?.action === 'use_existing' ? decisions[subsubKey].existingName : row.subsub_name;
    return {
      ...row,
      subcontractor_name: mappedSub,
      subsub_name: mappedSubsub,
    };
  };

  const preflightSimilarMasterDecisions = async (items: DefectImportFile[]) => {
    const { data } = await (supabase as any)
      .from('subcontractor_master')
      .select('id, name, type, parent_subcontractor_id');
    const masters = (data ?? []) as Array<{ id: string; name: string; type: string; parent_subcontractor_id: string | null }>;
    const subMasters = masters.filter((master) => (master.type ?? 'sub') === 'sub');
    const subIdToName = new Map(subMasters.map((master) => [master.id, master.name]));
    const exactSubs = new Set(subMasters.map((master) => masterNameKey(master.name)));
    const subsubMasters = masters
      .filter((master) => master.type === 'subsub')
      .map((master) => ({ ...master, parentName: master.parent_subcontractor_id ? subIdToName.get(master.parent_subcontractor_id) ?? null : null }));
    const exactSubsubs = new Set(subsubMasters.map((master) => `${masterNameKey(master.parentName)}::${masterNameKey(master.name)}`));
    const decisions = new Map<string, SimilarMasterDecision>();

    for (const item of items) {
      for (const row of item.parsed ?? []) {
        const subName = row.subcontractor_name?.trim();
        if (subName && !exactSubs.has(masterNameKey(subName))) {
          const key = `sub:${masterNameKey(subName)}`;
          const match = findSimilarMasterName(subName, subMasters);
          if (match && !decisions.has(key)) {
            decisions.set(key, { key, kind: 'subcontractor', importedName: subName, existingName: match.candidate.name, score: match.score });
          }
        }

        const parentName = (decisions.get(`sub:${masterNameKey(subName)}`)?.existingName ?? subName)?.trim();
        const subsubName = row.subsub_name?.trim();
        if (parentName && subsubName && !exactSubsubs.has(`${masterNameKey(parentName)}::${masterNameKey(subsubName)}`)) {
          const key = `subsub:${masterNameKey(parentName)}::${masterNameKey(subsubName)}`;
          const candidates = subsubMasters.filter((master) => masterNameKey(master.parentName) === masterNameKey(parentName));
          const match = findSimilarMasterName(subsubName, candidates);
          if (match && !decisions.has(key)) {
            decisions.set(key, { key, kind: 'subsub', importedName: subsubName, existingName: match.candidate.name, parentName, score: match.score });
          }
        }
      }
    }

    return [...decisions.values()];
  };

  const findDuplicateSubcontractorIssueNos = (items: DefectImportFile[]) => {
    const seen = new Map<string, string>();
    const duplicates = new Set<string>();
    for (const item of items) {
      for (const row of item.parsed ?? []) {
        const value = row.subcontractor_issue_no?.trim();
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) duplicates.add(value);
        seen.set(key, value);
      }
    }
    return [...duplicates];
  };

  const importOneFile = async (item: DefectImportFile, decisions: MasterNameDecisions) => {
    if (!user || !item.parsed) return { inserted: 0, updated: 0, skipped: 0, rejected: 0, teamUnresolved: 0, classifiedRule: 0, classifiedDiscipline: 0, unclassified: 0 };
    const dataDate = item.dataDate || todayIso();
    const profileTeamMap = await buildProfileTeamMap();
    const masterEnsurer = await createDefectMasterEnsurer(supabase as any);
    const issueRegistry = await buildIssueRegistry(null);

    const [rulesRes, fbRes] = await Promise.all([
      (supabase as any).from('defect_classification_rules').select('*').eq('is_active', true),
      (supabase as any).from('defect_discipline_fallback').select('*').eq('is_active', true),
    ]);
    const rules = (rulesRes.data ?? []) as ClassificationRule[];
    const fallbacks = (fbRes.data ?? []) as DisciplineFallback[];

    const mappedRows = item.parsed.map((row) => applyMasterDecisions(row, decisions));

    const isReimport = !!item.isReimport;

    // Existing-row lookup: by issue_no for everyone, plus by id for re-imports.
    const issueNos = mappedRows.map((row) => row.issue_no).filter((value): value is string => Boolean(value));
    const existingByIssueNo = new Map<string, any>();
    const existingById = new Map<string, any>();
    if (issueNos.length > 0) {
      const chunkSize = 200;
      for (let i = 0; i < issueNos.length; i += chunkSize) {
        const chunk = issueNos.slice(i, i + chunkSize);
        const { data } = await (supabase as any).from('defect_items').select('*').in('issue_no', chunk);
        for (const existing of data ?? []) {
          existingByIssueNo.set(existing.issue_no, existing);
          if (existing.id) existingById.set(String(existing.id), existing);
        }
      }
    }

    if (isReimport) {
      // Also fetch by ID for any rows whose issue_no may have been edited.
      const ids = mappedRows
        .map((row) => row.id)
        .filter((value): value is string => Boolean(value) && !existingById.has(String(value)));
      if (ids.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize);
          const { data } = await (supabase as any).from('defect_items').select('*').in('id', chunk);
          for (const existing of data ?? []) {
            existingById.set(String(existing.id), existing);
            if (existing.issue_no) existingByIssueNo.set(existing.issue_no, existing);
          }
        }
      }
    }

    const assignments = buildSubcontractorIssueAssignments(mappedRows, null, issueRegistry, existingByIssueNo);

    const batchRes = await (supabase as any).from('defect_upload_batches').insert({ uploaded_file_name: item.name, uploaded_by: user.id, status: 'processing', total_rows: item.parsed.length, data_date: dataDate }).select('id').single();
    const uploadId = batchRes.data?.id;
    let insertedCount = 0;
    let updatedCount = 0;
    let skipped = 0;
    let rejected = 0;
    let teamUnresolved = 0;
    let classifiedRule = 0;
    let classifiedDiscipline = 0;
    let unclassified = 0;

    // Honor the user's column selection from the dialog: only fields actually
    // mapped from Excel participate in change-detection / audit. This makes
    // "Subcontractor only" imports orders-of-magnitude faster than "all 32 columns".
    const excludedFields = item.excludedFields ?? new Set<string>();
    const isFieldExcluded = (field: string) => excludedFields.has(field);
    // Tracked fields restricted to the user's column selection.
    const activeTrackedFields = (trackedFields as readonly string[]).filter((f) => !isFieldExcluded(f));

    // ── Batch buffers (flushed in chunks to dramatically cut HTTP round-trips) ──
    type LogRow = Record<string, any>;
    type AuditRow = Record<string, any>;
    type SnapshotRow = Record<string, any>;
    type UpdateOp = { id: string; payload: Record<string, any> };
    type InsertOp = { payload: Record<string, any>; rawRowNo: number; issueNo: string; snapshotBase: SnapshotRow };

    const pendingLogs: LogRow[] = [];
    const pendingAudits: AuditRow[] = [];
    const pendingSnapshots: SnapshotRow[] = [];
    const pendingUpdates: UpdateOp[] = [];
    const pendingInserts: InsertOp[] = [];

    const FLUSH_THRESHOLD = 250;       // rows of accumulated work before we flush
    const INSERT_CHUNK = 200;          // PostgREST batch size for inserts
    const UPDATE_CONCURRENCY = 8;      // parallel updates per chunk

    const flushLogs = async () => {
      if (pendingLogs.length === 0) return;
      const batch = pendingLogs.splice(0, pendingLogs.length);
      for (let i = 0; i < batch.length; i += INSERT_CHUNK) {
        await (supabase as any).from('defect_upload_row_logs').insert(batch.slice(i, i + INSERT_CHUNK));
      }
    };
    const flushAudits = async () => {
      if (pendingAudits.length === 0) return;
      const batch = pendingAudits.splice(0, pendingAudits.length);
      for (let i = 0; i < batch.length; i += INSERT_CHUNK) {
        await (supabase as any).from('defect_schedule_change_audit').insert(batch.slice(i, i + INSERT_CHUNK));
      }
    };
    const flushUpdates = async () => {
      if (pendingUpdates.length === 0) return;
      const batch = pendingUpdates.splice(0, pendingUpdates.length);
      // Run updates with bounded concurrency (Supabase has no true bulk update).
      for (let i = 0; i < batch.length; i += UPDATE_CONCURRENCY) {
        const results = await Promise.all(
          batch.slice(i, i + UPDATE_CONCURRENCY).map((op) =>
            (supabase as any).from('defect_items').update(op.payload).eq('id', op.id)
          )
        );
        for (const r of results) {
          if (r?.error) {
            // Surface DB errors so the import does not silently report success.
            throw new Error(`defect_items UPDATE failed: ${r.error.message ?? JSON.stringify(r.error)}`);
          }
        }
      }
    };
    const flushInserts = async () => {
      if (pendingInserts.length === 0) return;
      const batch = pendingInserts.splice(0, pendingInserts.length);
      for (let i = 0; i < batch.length; i += INSERT_CHUNK) {
        const slice = batch.slice(i, i + INSERT_CHUNK);
        const payloads = slice.map((op) => op.payload);
        const res = await (supabase as any).from('defect_items').insert(payloads).select('id');
        if (res?.error) {
          // Surface DB errors so the import does not silently report success.
          throw new Error(`defect_items INSERT failed: ${res.error.message ?? JSON.stringify(res.error)}`);
        }
        const newIds: Array<{ id: string }> = res.data ?? [];
        // Map insert return order back to snapshot bases (Supabase preserves order).
        for (let j = 0; j < slice.length; j++) {
          const newId = newIds[j]?.id;
          if (newId) pendingSnapshots.push({ ...slice[j].snapshotBase, defect_id: newId });
        }
      }
    };
    const flushSnapshots = async () => {
      if (pendingSnapshots.length === 0) return;
      const batch = pendingSnapshots.splice(0, pendingSnapshots.length);
      for (let i = 0; i < batch.length; i += INSERT_CHUNK) {
        await (supabase as any).from('defect_daily_snapshots').insert(batch.slice(i, i + INSERT_CHUNK));
      }
    };
    const flushAll = async () => {
      // Order matters: inserts first to materialize defect IDs for snapshots,
      // then snapshots; updates and audits/logs are independent.
      await flushInserts();
      await flushSnapshots();
      await flushUpdates();
      await flushAudits();
      await flushLogs();
    };
    const maybeFlush = async () => {
      const total = pendingLogs.length + pendingAudits.length + pendingInserts.length + pendingUpdates.length;
      if (total >= FLUSH_THRESHOLD) await flushAll();
    };

    // Progress is updated per chunk (not per row) to avoid React re-render thrashing.
    const PROGRESS_TICK = Math.max(1, Math.floor(mappedRows.length / 50));

    for (let index = 0; index < mappedRows.length; index++) {
      const row = mappedRows[index];
      if (index % PROGRESS_TICK === 0 || index === mappedRows.length - 1) {
        const pct = Math.round(((index + 1) / mappedRows.length) * 100);
        setFiles((current) => current.map((file) => file.id === item.id ? { ...file, progress: pct } : file));
      }
      if (!row.issue_no) {
        rejected++;
        pendingLogs.push({ upload_id: uploadId, raw_row_no: row.rawRowNo, action_taken: 'rejected', reason_code: 'missing_issue_no', reason_detail: 'Issue No is required' });
        await maybeFlush();
        continue;
      }

      await masterEnsurer.ensureForRow(row);

      // Look up existing row FIRST so we can apply "blank in Excel = keep DB value" policy
      // before any downstream logic (auto-progress, classifier, status, etc.) reads the row.
      // For re-import: prefer matching by id (which is included in the export);
      // fall back to issue_no for backward compatibility.
      const existing = (isReimport && row.id ? existingById.get(String(row.id)) : null)
        ?? existingByIssueNo.get(row.issue_no)
        ?? null;

      // Capture Excel-explicit values BEFORE preservation merges in existing DB values.
      // Used by reconcileClosureCompletion to enforce "Excel value wins" on closure/completion conflicts.
      const excelExplicit = {
        actual_progress_pct: row.actual_progress_pct ?? null,
        actual_completion_date: row.actual_completion_date ?? null,
      };

      // Apply blank-preservation for general data fields (description, dates, PIC, etc.)
      preserveExistingForBlank(row, existing);

      // Recompute planned_progress_pct from (possibly preserved) planned dates.
      // If still not computable, fall back to existing DB value rather than overwriting with null.
      const computedPlanned = computePlannedProgressPct(row.planned_start_date, row.planned_completion_date, dataDate);
      row.planned_progress_pct = computedPlanned ?? existing?.planned_progress_pct ?? null;
      if (computedPlanned == null) {
        if (!row.planned_start_date || !row.planned_completion_date) {
          pendingLogs.push({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'updated', reason_code: 'planned_pct_not_computable', reason_detail: 'Missing planned_start_date or planned_completion_date' });
        } else if (row.planned_completion_date < row.planned_start_date) {
          pendingLogs.push({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'updated', reason_code: 'planned_pct_invalid_dates', reason_detail: 'Planned completion is earlier than planned start' });
        } else if (dataDate < row.planned_start_date) {
          pendingLogs.push({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'updated', reason_code: 'planned_pct_not_started', reason_detail: 'Data date is before planned start date' });
        }
      }

      // Classification priority for main_trade / sub_trade / work_type:
      //   1) Excel value (if present)            -> use it (source: 'manual')
      //   2) Existing DB value (if present)      -> keep it (preserve previous source/timestamp)
      //   3) Otherwise                           -> run classifyDefect() and use its result
      const excelHasMain = !!row.main_trade;
      const excelHasSub = !!row.sub_trade;
      const excelHasWork = !!row.work_type;
      const dbHasMain = !!existing?.main_trade;
      const dbHasSub = !!existing?.sub_trade;
      const dbHasWork = !!existing?.work_type;

      const needClassify =
        (!excelHasMain && !dbHasMain) ||
        (!excelHasSub && !dbHasSub) ||
        (!excelHasWork && !dbHasWork);

      const classification = needClassify
        ? classifyDefect(
            { description: row.description, field_discipline: row.trade_detail },
            rules,
            fallbacks,
          )
        : null;

      // Treat empty-string classifier output (the 'unclassified' case) as null
      // so the DB stores blank trade columns instead of a placeholder label.
      if (!excelHasMain) row.main_trade = existing?.main_trade ?? (classification?.main_trade || null);
      if (!excelHasSub) row.sub_trade = existing?.sub_trade ?? (classification?.sub_trade || null);
      if (!excelHasWork) row.work_type = existing?.work_type ?? (classification?.work_type || null);

      const classifierApplied = !!classification && (
        (!excelHasMain && !dbHasMain) ||
        (!excelHasSub && !dbHasSub) ||
        (!excelHasWork && !dbHasWork)
      );
      const excelProvidedAny = excelHasMain || excelHasSub || excelHasWork;

      let classificationSource: string | null;
      let classifiedAt: string | null;
      if (classifierApplied && classification) {
        classificationSource = classification.source;
        classifiedAt = new Date().toISOString();
        if (classification.source === 'rule') classifiedRule++;
        else if (classification.source === 'discipline') {
          classifiedDiscipline++;
          pendingLogs.push({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'updated', reason_code: 'discipline_fallback', reason_detail: `Auto-classified via Field Discipline fallback (${row.trade_detail ?? ''}).` });
        } else {
          unclassified++;
          pendingLogs.push({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'updated', reason_code: 'unclassified_defect', reason_detail: 'Could not classify from description or Field Discipline.' });
        }
      } else if (excelProvidedAny && !existing) {
        classificationSource = 'manual';
        classifiedAt = new Date().toISOString();
      } else {
        classificationSource = existing?.classification_source ?? 'manual';
        classifiedAt = existing?.classified_at ?? new Date().toISOString();
      }

      if (isReimport && !existing) {
        rejected++;
        pendingLogs.push({
          upload_id: uploadId,
          raw_row_no: row.rawRowNo,
          issue_no: row.issue_no,
          action_taken: 'rejected',
          reason_code: 'reimport_not_found',
          reason_detail: `Re-import row could not be matched to any existing defect (id=${row.id ?? 'n/a'}, issue_no=${row.issue_no}). New rows are not created in re-import mode.`,
        });
        await maybeFlush();
        continue;
      }

      const issueAssignment = assignments.get(row.rawRowNo)
        ?? reserveSubcontractorIssueNo(row, existing?.project_id ?? null, issueRegistry, existing);
      if (issueAssignment.duplicate) {
        rejected++;
        pendingLogs.push({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'rejected', reason_code: 'duplicate_subcontractor_issue_no', reason_detail: `${issueAssignment.subcontractor_issue_no} already exists in this project.` });
        await maybeFlush();
        continue;
      }
      const resolvedTeam = resolveDefectTeam(row, profileTeamMap) ?? existing?.team ?? null;
      const logReason = resolvedTeam ? {} : { reason_code: 'team_unresolved', reason_detail: 'Team could not be resolved from Field Discipline or User Management profile.' };
      if (!resolvedTeam) teamUnresolved++;
      let actualCompletionDate = Number(row.actual_progress_pct ?? 0) >= 100
        ? (row.actual_completion_date ?? existing?.actual_completion_date ?? dataDate)
        : (row.actual_completion_date ?? existing?.actual_completion_date ?? null);
      let actualProgressPct: number | null = row.actual_progress_pct ?? null;

      const statusInputs = {
        planned_start_date: row.planned_start_date,
        planned_completion_date: row.planned_completion_date,
        planned_closure_date: row.planned_closure_date,
        actual_start_date: row.actual_start_date,
        actual_completion_date: actualCompletionDate,
        actual_closure_date: row.actual_closure_date,
        planned_progress_pct: row.planned_progress_pct,
        actual_progress_pct: actualProgressPct,
        status: row.status,
      };
      const reconciled = reconcileClosureCompletion(statusInputs, dataDate, excelExplicit);
      let completionStatus: string | null = reconciled.completion_status;
      let closureStatus: string | null = reconciled.closure_status;
      let autoReconciled = false;
      if (reconciled.patch) {
        actualCompletionDate = reconciled.patch.actual_completion_date;
        actualProgressPct = reconciled.patch.actual_progress_pct;
        autoReconciled = true;
      }
      if (reconciled.conflict) {
        pendingLogs.push({
          upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no,
          action_taken: existing ? 'updated' : 'inserted',
          reason_code: 'closure_completion_conflict',
          reason_detail: reconciled.conflictDetail,
        });
      }

      if (row.completion_status) {
        if (isValidDefectStatus(row.completion_status)) completionStatus = row.completion_status;
        else pendingLogs.push({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'updated', reason_code: 'invalid_status_value', reason_detail: `completion_status="${row.completion_status}" not in Planned/Delay/Done/WIP. Auto-computed.` });
      } else if (!row.planned_completion_date && !row.planned_closure_date && !autoReconciled) {
        completionStatus = existing?.completion_status ?? null;
        if (completionStatus == null) {
          pendingLogs.push({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'updated', reason_code: 'missing_planned_dates', reason_detail: 'No planned dates; completion_status set to null.' });
        }
      }
      if (row.closure_status) {
        if (isValidDefectStatus(row.closure_status)) closureStatus = row.closure_status;
        else pendingLogs.push({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'updated', reason_code: 'invalid_status_value', reason_detail: `closure_status="${row.closure_status}" not in Planned/Delay/Done/WIP. Auto-computed.` });
      } else if (!row.planned_completion_date && !row.planned_closure_date) {
        closureStatus = existing?.closure_status ?? null;
      }

      if (autoReconciled) {
        row.actual_progress_pct = actualProgressPct;
        row.actual_completion_date = actualCompletionDate;
      }

      // Build payload from row, then strip any keys that are NOT real defect_items columns.
      // PostgREST sends every key as a column name (even when value is undefined), so leaving
      // a non-column key like `rawRowNo` causes HTTP 400 PGRST204 and the entire batch fails silently.
      const payload: Record<string, any> = {
        ...row,
        subcontractor_issue_no: issueAssignment.subcontractor_issue_no,
        subcontractor_issue_source: issueAssignment.subcontractor_issue_source,
        actual_completion_date: actualCompletionDate,
        actual_progress_pct: actualProgressPct,
        completion_status: completionStatus,
        closure_status: closureStatus,
        team: resolvedTeam,
        classification_source: classificationSource,
        classified_at: classifiedAt,
        source_upload_id: uploadId,
        data_source_type: 'defect_import',
        updated_by: user.id,
        row_version: (existing?.row_version ?? 0) + 1,
      };
      // Strip non-column keys carried over from the parser / spread.
      delete payload.rawRowNo;
      delete payload.id;

      if (existing) {
        // Change-detection skips fields the user did NOT map from Excel — without this,
        // every "preserved" field would be re-compared and audited even though it never
        // changed, which is the root cause of "4 columns and 32 columns take the same time".
        const hasAnyChange = Object.entries(payload).some(([key, value]) => {
          if (key === 'raw_payload' || key === 'row_version' || key === 'updated_by' || key === 'source_upload_id') return false;
          if (isFieldExcluded(key)) return false;
          return changed(existing[key], value);
        });
        if (!hasAnyChange) {
          skipped++;
          pendingLogs.push({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'skipped', ...logReason });
          await maybeFlush();
          continue;
        }
        pendingUpdates.push({ id: existing.id, payload });
        for (const field of activeTrackedFields) {
          if (changed(existing[field], (row as any)[field])) {
            const isDate = field.endsWith('_date');
            const oldVal = (existing as any)[field] ?? null;
            const newVal = (row as any)[field] ?? null;
            const auditPayload: Record<string, any> = {
              upload_id: uploadId, defect_id: existing.id, project_id: existing.project_id, issue_no: row.issue_no, subcontractor_issue_no: payload.subcontractor_issue_no, raw_row_no: row.rawRowNo,
              created_by: user.id, change_source: 'excel_import',
            };
            if (isDate) {
              auditPayload[`${field.replace(/_date$/, '')}_old_date`] = oldVal;
              auditPayload[`${field.replace(/_date$/, '')}_new_date`] = newVal;
              auditPayload[`${field.replace(/_date$/, '')}_diff_days`] = daysDiff(oldVal, newVal);
            } else if (field === 'actual_progress_pct') {
              auditPayload.progress_old_pct = oldVal;
              auditPayload.progress_new_pct = newVal;
              auditPayload.progress_diff_pct = Number(newVal ?? 0) - Number(oldVal ?? 0);
            } else if (field === 'planned_progress_pct') {
              auditPayload.planned_progress_old_pct = oldVal;
              auditPayload.planned_progress_new_pct = newVal;
              auditPayload.planned_progress_diff_pct = Number(newVal ?? 0) - Number(oldVal ?? 0);
            } else if (field === 'completion_status') {
              auditPayload.completion_status_old = oldVal;
              auditPayload.completion_status_new = newVal;
            } else if (field === 'closure_status') {
              auditPayload.closure_status_old = oldVal;
              auditPayload.closure_status_new = newVal;
            }
            pendingAudits.push(auditPayload);
          }
        }
        updatedCount++;
        pendingLogs.push({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'updated', ...logReason });
      } else {
        pendingInserts.push({
          payload,
          rawRowNo: row.rawRowNo,
          issueNo: row.issue_no,
          snapshotBase: {
            issue_no: row.issue_no,
            snapshot_date: dataDate,
            planned_completion_date: row.planned_completion_date,
            actual_completion_date: row.actual_completion_date,
            planned_closure_date: row.planned_closure_date,
            actual_closure_date: row.actual_closure_date,
            planned_progress_pct: payload.planned_progress_pct,
            actual_progress_pct: row.actual_progress_pct,
            completion_status: completionStatus,
            closure_status: closureStatus,
            created_by: user.id,
          },
        });
        insertedCount++;
        pendingLogs.push({ upload_id: uploadId, raw_row_no: row.rawRowNo, issue_no: row.issue_no, action_taken: 'inserted', ...logReason });
      }
      await maybeFlush();
    }

    // Final flush of any leftovers from the last partial chunk.
    await flushAll();

    await (supabase as any).from('defect_upload_batches').update({ status: 'completed', processed_rows: item.parsed.length, success_rows: insertedCount + updatedCount, skipped_rows: skipped, rejected_rows: rejected }).eq('id', uploadId);
    if (masterEnsurer.warnings.length > 0) {
      toast({
        title: `${masterEnsurer.warnings.length} master user warning(s)`,
        description: masterEnsurer.warnings.slice(0, 3).join('; ') + (masterEnsurer.warnings.length > 3 ? '...' : ''),
        variant: 'destructive',
      });
    }
    return { inserted: insertedCount, updated: updatedCount, skipped, rejected, teamUnresolved, classifiedRule, classifiedDiscipline, unclassified };
  };

  const runImport = async (items: DefectImportFile[], decisions: MasterNameDecisions) => {
    setIsRunning(true);
    for (const item of items) {
      setFiles((current) => current.map((file) => file.id === item.id ? { ...file, status: 'processing', progress: 0 } : file));
      try {
        const result = await importOneFile(item, decisions);
        setFiles((current) => current.map((file) => file.id === item.id ? { ...file, status: 'done', progress: 100, result } : file));
      } catch (error) {
        setFiles((current) => current.map((file) => file.id === item.id ? { ...file, status: 'failed', error: error instanceof Error ? error.message : 'Import failed' } : file));
      }
    }
    setIsRunning(false);
    toast({ title: 'Defect import complete' });
  };

  const startImport = useCallback(async () => {
    const readyFiles = files.filter((file) => file.status === 'ready');
    setIsRunning(true);
    try {
      const decisions = await preflightSimilarMasterDecisions(readyFiles);
      const duplicateIssueNos = findDuplicateSubcontractorIssueNos(readyFiles);
      if (duplicateIssueNos.length > 0) toast({ title: 'Same Subcontractor Issue No found in multiple imported rows', description: duplicateIssueNos.slice(0, 5).join(', '), variant: 'destructive' });
      if (decisions.length > 0) {
        setSimilarDecisions(decisions);
        setPendingImportFiles(readyFiles);
        setIsRunning(false);
        return;
      }
      setIsRunning(false);
      await runImport(readyFiles, confirmedDecisions);
    } catch (error) {
      setIsRunning(false);
      toast({ title: 'Similarity check failed', description: error instanceof Error ? error.message : 'Unable to check master names', variant: 'destructive' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, confirmedDecisions, user]);

  const setDecisionAction = useCallback((key: string, action: SimilarDecisionAction) => {
    setSimilarDecisions((current) => current.map((decision) => decision.key === key ? { ...decision, action } : decision));
  }, []);

  const confirmSimilarDecisions = useCallback(async () => {
    if (!pendingImportFiles || similarDecisions.some((decision) => !decision.action)) return;
    const nextDecisions = similarDecisions.reduce<MasterNameDecisions>((acc, decision) => {
      acc[decision.key] = decision;
      return acc;
    }, { ...confirmedDecisions });
    setConfirmedDecisions(nextDecisions);
    setSimilarDecisions([]);
    const items = pendingImportFiles;
    setPendingImportFiles(null);
    await runImport(items, nextDecisions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImportFiles, similarDecisions, confirmedDecisions]);

  const cancelSimilarDecisions = useCallback(() => {
    setSimilarDecisions([]);
    setPendingImportFiles(null);
  }, []);

  return (
    <DefectImportContext.Provider
      value={{
        files,
        isRunning,
        similarDecisions,
        addFiles,
        removeFile,
        clearAll,
        setFileDataDate,
        setFileSheet,
        setFileExcludedHeaders,
        startImport,
        setDecisionAction,
        confirmSimilarDecisions,
        cancelSimilarDecisions,
      }}
    >
      {children}
    </DefectImportContext.Provider>
  );
}
