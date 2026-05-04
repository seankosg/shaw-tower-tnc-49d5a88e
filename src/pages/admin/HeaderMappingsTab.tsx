import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useHeaderMappings, type HeaderMappingRow } from '@/hooks/useHeaderMappings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Lock, Plus, Trash2, Pencil, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomFields } from '@/hooks/useCustomFields';
import { loadHeaderMappingsCache } from '@/lib/header-mappings-cache';

/** Bump app_settings.header_mappings_version so other tabs/sessions reload parser cache. */
async function bumpHeaderMappingsVersion() {
  const { data } = await (supabase as any)
    .from('app_settings')
    .select('value')
    .eq('key', 'header_mappings_version')
    .maybeSingle();
  const next = ((data?.value as number | null) ?? 0) + 1;
  await (supabase as any)
    .from('app_settings')
    .upsert({ key: 'header_mappings_version', value: next }, { onConflict: 'key' });
}

/** Bump version + force-reload the in-memory parser cache immediately. */
async function reloadHeaderMappings() {
  await bumpHeaderMappingsVersion();
  await loadHeaderMappingsCache(true).catch(() => {});
}

type TopModuleKey = 'tnc' | 'defect' | 'docs';
type DocsSubKey = 'as_built' | 'warranty';

/** Internal module context: (module, sub_module). sub_module is '' for tnc/defect. */
interface ModuleContext {
  module: TopModuleKey;
  sub_module: string; // '' | 'as_built' | 'warranty'
}

// System field whitelists per (module, sub_module) — keep in sync with parsers.
const TNC_FIELDS = [
  'system','item_no','team','level','equipment','description',
  'mos_1','mos_2','mos_3','mos_4','mos_5','mos_code','subtest_id',
  't1_planned_date','t1_status','t2_planned_date','t2_status',
  'predecessor_status_raw','subcontractor_name','subsub_name','hdec_pic_name',
  'r1_status','r2_status','r1_report_ref',
  'r1_target_submission_date','r1_actual_submission_date',
  'r2_target_submission_date','r2_actual_submission_date',
  'r2_target_approval_date','r2_actual_approval_date',
  'aconex_ref_no','remarks','punchlist_comments','source','updated_at',
] as const;

const DEFECT_FIELDS = [
  'id','issue_no','defect_type','area_raw','area_location','area_level','description','status',
  'trade_detail','priority','main_trade','sub_trade',
  'subcontractor_name','subsub_name','hdec_pic_name','hdec_eng_name',
  'remarks','aconex_comments','hdec_comments',
  'planned_start_date','planned_completion_date','planned_closure_date',
  'actual_start_date','actual_completion_date','actual_closure_date',
  'planned_progress_pct','actual_progress_pct','completion_status','closure_status',
  'work_type','subcontractor_issue_no','subcontractor_issue_source',
] as const;

// Docs / As-Built (drawings via Aconex) — v2 schema (3 cycles + actual response + subcontractor)
const DOCS_AS_BUILT_FIELDS = [
  'document_no','title','revision','discipline','document_type',
  'series','level_location','sequential_no',
  'organisation_raw','subcontractor_name','current_status',
  'sub1_planned_date','sub1_submission_date','sub1_approval_date','sub1_actual_response_date','sub1_approval_status',
  'sub2_planned_date','sub2_submission_date','sub2_approval_date','sub2_actual_response_date','sub2_approval_status',
  'sub3_planned_date','sub3_submission_date','sub3_approval_date','sub3_actual_response_date','sub3_approval_status',
  'transmittal_number','transmittal_due_date','days_due',
  'hdec_pic_name','hdec_eng_name','remarks',
] as const;

// Docs / Warranty (warranty deed workflow)
const DOCS_WARRANTY_FIELDS = [
  'item_no','category','sub_category','warranted_item','subcontractor_name_raw',
  'sc_target_date','internal_target_date',
  'stage1_date','stage2_date','stage3_date','stage4_date','stage5_date',
  'stage6_date','stage7_date','stage8_date','stage9_date',
  'witness_director','witness_secretary',
  'validation_acra','validation_signature','validation_witness','validation_seal',
  'validation_date','validation_pass','remarks',
] as const;

// Docs sub-modules registry — add new sub-modules here to auto-register a tab.
const DOCS_SUBMODULES: Array<{
  key: DocsSubKey;
  label: string;
  fields: readonly string[];
}> = [
  { key: 'as_built', label: 'As-Built', fields: DOCS_AS_BUILT_FIELDS },
  { key: 'warranty', label: 'Warranty', fields: DOCS_WARRANTY_FIELDS },
];

function getFieldList(ctx: ModuleContext): readonly string[] {
  if (ctx.module === 'tnc') return TNC_FIELDS;
  if (ctx.module === 'defect') return DEFECT_FIELDS;
  const sub = DOCS_SUBMODULES.find((s) => s.key === ctx.sub_module);
  return sub?.fields ?? [];
}

function normalizeAlias(ctx: ModuleContext, raw: string): string {
  if (ctx.module === 'tnc') {
    return raw.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  if (ctx.module === 'defect') {
    return raw.replace(/\s*\(H\)\s*$/i, '').trim()
      .toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // docs (both as_built & warranty): collapse whitespace + lowercase, strip trailing periods.
  return raw.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
    .toLowerCase().replace(/\.$/, '').trim();
}

function ctxMatches(row: HeaderMappingRow, ctx: ModuleContext): boolean {
  if (row.module !== ctx.module) return false;
  if (ctx.module === 'docs') return (row.sub_module ?? '') === ctx.sub_module;
  return !row.sub_module;
}

function ctxLabel(ctx: ModuleContext): string {
  if (ctx.module === 'tnc') return 'T&C';
  if (ctx.module === 'defect') return 'DEFECT';
  return `DOCS / ${DOCS_SUBMODULES.find((s) => s.key === ctx.sub_module)?.label ?? ctx.sub_module}`;
}

interface AddDialogState {
  open: boolean;
  prefilledTarget?: string;
  lockTarget?: boolean;
}

export default function HeaderMappingsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: mappings = [], isLoading, refetch } = useHeaderMappings();
  const { data: customFields = [] } = useCustomFields();

  const [topModule, setTopModule] = useState<TopModuleKey>('tnc');
  const [docsSub, setDocsSub] = useState<DocsSubKey>('as_built');

  const ctx: ModuleContext = useMemo(
    () => topModule === 'docs'
      ? { module: 'docs', sub_module: docsSub }
      : { module: topModule, sub_module: '' },
    [topModule, docsSub],
  );

  const [search, setSearch] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [editTarget, setEditTarget] = useState<HeaderMappingRow | null>(null);
  const [addDialog, setAddDialog] = useState<AddDialogState>({ open: false });
  const [testHeader, setTestHeader] = useState('');

  const customForActive = useMemo(
    () => customFields
      .filter((f) => {
        if (f.module !== ctx.module) return false;
        if (ctx.module === 'docs') return (f.sub_module ?? '') === ctx.sub_module;
        return !f.sub_module;
      })
      .filter((f) => f.is_active)
      .map((f) => ({ value: `custom:${f.field_name}`, label: `[Custom] ${f.display_name} (${f.data_type})` })),
    [customFields, ctx],
  );
  const fieldList = getFieldList(ctx);

  // Mappings filtered to active context + search
  const moduleRows = useMemo(
    () => mappings.filter((m) => ctxMatches(m, ctx)),
    [mappings, ctx],
  );

  const lowerSearch = search.trim().toLowerCase();
  const matchesSearch = (m: HeaderMappingRow) =>
    !lowerSearch ||
    m.header_alias.toLowerCase().includes(lowerSearch) ||
    m.target_field.toLowerCase().includes(lowerSearch);

  const groupedByTarget = useMemo(() => {
    const map = new Map<string, HeaderMappingRow[]>();
    for (const row of moduleRows) {
      const arr = map.get(row.target_field) ?? [];
      arr.push(row);
      map.set(row.target_field, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
        return a.header_alias.localeCompare(b.header_alias);
      });
    }
    return map;
  }, [moduleRows]);

  interface GroupSection {
    target: string;
    label: string;
    kind: 'system' | 'custom' | 'unmapped';
    rows: HeaderMappingRow[];
  }

  const sections = useMemo((): GroupSection[] => {
    const out: GroupSection[] = [];
    const seen = new Set<string>();

    for (const f of fieldList) {
      const rows = groupedByTarget.get(f) ?? [];
      seen.add(f);
      if (rows.length === 0 && !showEmpty) continue;
      out.push({ target: f, label: f, kind: 'system', rows });
    }
    for (const c of customForActive) {
      const rows = groupedByTarget.get(c.value) ?? [];
      seen.add(c.value);
      if (rows.length === 0 && !showEmpty) continue;
      out.push({ target: c.value, label: c.label, kind: 'custom', rows });
    }

    const unmappedRows: HeaderMappingRow[] = [];
    for (const [target, rows] of groupedByTarget.entries()) {
      if (seen.has(target)) continue;
      unmappedRows.push(...rows);
    }
    if (unmappedRows.length > 0) {
      out.push({
        target: '__unmapped__',
        label: `(unmapped — ${unmappedRows.length} alias${unmappedRows.length === 1 ? '' : 'es'})`,
        kind: 'unmapped',
        rows: unmappedRows,
      });
    }
    return out;
  }, [fieldList, customForActive, groupedByTarget, showEmpty]);

  const visibleSections = useMemo(() => {
    if (!lowerSearch) return sections;
    return sections
      .map((s) => {
        const targetMatches = s.label.toLowerCase().includes(lowerSearch);
        const rows = targetMatches ? s.rows : s.rows.filter(matchesSearch);
        if (rows.length === 0 && !targetMatches) return null;
        return { ...s, rows };
      })
      .filter((s): s is GroupSection => s !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, lowerSearch]);

  const [manualOpenIds, setManualOpenIds] = useState<string[] | null>(null);

  const openValues = useMemo(() => {
    if (lowerSearch) return visibleSections.map((s) => s.target);
    if (manualOpenIds !== null) return manualOpenIds;
    return undefined;
  }, [lowerSearch, visibleSections, manualOpenIds]);

  const expandAll = () => setManualOpenIds(visibleSections.map((s) => s.target));
  const collapseAll = () => setManualOpenIds([]);

  const testResult = useMemo(() => {
    if (!testHeader.trim()) return null;
    const norm = normalizeAlias(ctx, testHeader);
    const hit = mappings.find((m) => ctxMatches(m, ctx) && m.header_alias === norm && m.is_active);
    return { norm, target: hit?.target_field ?? null, isSystem: hit?.is_system ?? false };
  }, [testHeader, ctx, mappings]);

  const toggleActive = async (row: HeaderMappingRow) => {
    const { error } = await supabase
      .from('import_header_mappings')
      .update({ is_active: !row.is_active, updated_by: user?.id ?? null })
      .eq('id', row.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: row.is_active ? 'Mapping disabled' : 'Mapping enabled' });
      await reloadHeaderMappings();
      refetch();
    }
  };

  const removeRow = async (row: HeaderMappingRow) => {
    if (row.is_system) {
      toast({ title: 'Protected', description: 'System mapping cannot be deleted.', variant: 'destructive' });
      return;
    }
    if (!confirm(`Delete mapping "${row.header_alias}" → ${row.target_field}?`)) return;
    const { error } = await supabase.from('import_header_mappings').delete().eq('id', row.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Mapping deleted' }); await reloadHeaderMappings(); refetch(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Excel Header Mappings</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Map raw Excel column headers to system fields, grouped by target field. System mappings are locked to prevent breaking imports.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddDialog({ open: true })}>
          <Plus className="h-4 w-4 mr-1" /> Add Mapping
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={topModule} onValueChange={(v) => setTopModule(v as TopModuleKey)}>
          <TabsList>
            <TabsTrigger value="tnc">T&amp;C</TabsTrigger>
            <TabsTrigger value="defect">Defect</TabsTrigger>
            <TabsTrigger value="docs">Docs</TabsTrigger>
          </TabsList>
        </Tabs>

        {topModule === 'docs' && (
          <Tabs value={docsSub} onValueChange={(v) => setDocsSub(v as DocsSubKey)}>
            <TabsList>
              {DOCS_SUBMODULES.map((s) => (
                <TabsTrigger key={s.key} value={s.key}>{s.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* Test tool */}
        <div className="rounded border p-3 bg-muted/30 space-y-2">
          <Label className="text-xs font-semibold">Mapping Test</Label>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Paste an Excel header to preview the mapping…"
              value={testHeader}
              onChange={(e) => setTestHeader(e.target.value)}
              className="max-w-md"
            />
            {testResult && (
              <div className="text-xs space-x-2">
                <span className="text-muted-foreground">normalized:</span>
                <code className="bg-background px-1 rounded">{testResult.norm}</code>
                <span className="text-muted-foreground">→</span>
                {testResult.target ? (
                  <Badge variant={testResult.isSystem ? 'default' : 'secondary'}>
                    {testResult.target}{testResult.isSystem ? ' (system)' : ''}
                  </Badge>
                ) : (
                  <Badge variant="outline">no match (will fall back / be ignored)</Badge>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <Input
            placeholder="Search alias or target field…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={showEmpty} onCheckedChange={(v) => setShowEmpty(v === true)} />
            Show empty fields
          </label>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-8" onClick={expandAll} title="Expand all">
              <ChevronsUpDown className="h-3.5 w-3.5 mr-1" /> Expand all
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={collapseAll} title="Collapse all">
              <ChevronsDownUp className="h-3.5 w-3.5 mr-1" /> Collapse all
            </Button>
          </div>
          <div className="text-xs text-muted-foreground ml-auto">
            {moduleRows.length} alias{moduleRows.length === 1 ? '' : 'es'} · {visibleSections.length} group{visibleSections.length === 1 ? '' : 's'}
          </div>
        </div>

        {isLoading && (
          <div className="text-center text-sm text-muted-foreground py-8">Loading…</div>
        )}

        {!isLoading && visibleSections.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8 border rounded">
            No mappings to display.
          </div>
        )}

        {!isLoading && visibleSections.length > 0 && (
          <Accordion
            type="multiple"
            value={openValues}
            className="space-y-2"
          >
            {visibleSections.map((section) => {
              const aliasCount = section.rows.length;
              const sourceCount = section.rows.filter((r) => r.is_system).length;
              const extraCount = aliasCount - sourceCount;
              const inactiveCount = section.rows.filter((r) => !r.is_active).length;
              return (
                <AccordionItem
                  key={section.target}
                  value={section.target}
                  className="border rounded-md bg-card"
                >
                  <div className="flex items-center px-3">
                    <AccordionTrigger className="flex-1 py-2 hover:no-underline">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-mono text-sm ${section.kind === 'unmapped' ? 'text-amber-700 dark:text-amber-300 italic' : 'font-medium'}`}>
                          {section.label}
                        </span>
                        {section.kind !== 'unmapped' && aliasCount > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            {sourceCount} source · {extraCount} extra
                            {inactiveCount > 0 ? ` · ${inactiveCount} off` : ''}
                          </Badge>
                        )}
                        {aliasCount === 0 && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground italic">
                            empty
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    {section.kind !== 'unmapped' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-2 h-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddDialog({ open: true, prefilledTarget: section.target, lockTarget: true });
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Alias
                      </Button>
                    )}
                  </div>
                  <AccordionContent className="pt-0 pb-2 px-3">
                    {section.rows.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic py-2 pl-2">
                        No aliases yet. Click "+ Alias" to add one.
                      </div>
                    ) : (
                      <div className="border-t">
                        {/* Column header */}
                        <div className="grid grid-cols-[1.2fr_90px_1.8fr_auto_auto_auto] items-center gap-3 py-1.5 px-1 text-[10px] uppercase tracking-wide text-muted-foreground border-b">
                          <div>System Field</div>
                          <div>Kind</div>
                          <div>Alias</div>
                          <div className="text-center">On</div>
                          <div></div>
                          <div></div>
                        </div>
                        <div className="divide-y">
                          {section.rows.map((row) => (
                            <div
                              key={row.id}
                              className={`grid grid-cols-[1.2fr_90px_1.8fr_auto_auto_auto] items-center gap-3 py-1.5 px-1 ${row.is_active ? '' : 'opacity-50'}`}
                            >
                              <div className="min-w-0 font-mono text-xs truncate" title={row.target_field}>
                                {row.target_field}
                              </div>
                              <div>
                                {row.is_system ? (
                                  <Badge variant="outline" className="text-[10px] gap-1">
                                    <Lock className="h-2.5 w-2.5" /> Source
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Extra
                                  </Badge>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-mono text-xs truncate">{row.header_alias}</div>
                                {row.note && (
                                  <div className="text-[11px] text-muted-foreground truncate">{row.note}</div>
                                )}
                              </div>
                              <Switch
                                checked={row.is_active}
                                onCheckedChange={() => toggleActive(row)}
                                aria-label="Toggle active"
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                disabled={row.is_system}
                                onClick={() => setEditTarget(row)}
                                title={row.is_system ? 'System (locked)' : 'Edit'}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                disabled={row.is_system}
                                onClick={() => removeRow(row)}
                                title={row.is_system ? 'System (locked)' : 'Delete'}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </CardContent>

      <MappingDialog
        open={addDialog.open}
        onClose={() => setAddDialog({ open: false })}
        ctx={ctx}
        fieldList={fieldList as readonly string[]}
        customOptions={customForActive}
        existing={mappings}
        userId={user?.id ?? null}
        prefilledTarget={addDialog.prefilledTarget}
        lockTarget={addDialog.lockTarget}
        onSaved={refetch}
      />
      <MappingDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        ctx={ctx}
        fieldList={fieldList as readonly string[]}
        customOptions={customForActive}
        existing={mappings}
        userId={user?.id ?? null}
        editing={editTarget}
        onSaved={refetch}
      />
    </Card>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  ctx: ModuleContext;
  fieldList: readonly string[];
  customOptions?: { value: string; label: string }[];
  existing: HeaderMappingRow[];
  userId: string | null;
  editing?: HeaderMappingRow | null;
  prefilledTarget?: string;
  lockTarget?: boolean;
  onSaved: () => void;
}

function MappingDialog({ open, onClose, ctx, fieldList, customOptions = [], existing, userId, editing, prefilledTarget, lockTarget, onSaved }: DialogProps) {
  const { toast } = useToast();
  const [alias, setAlias] = useState('');
  const [target, setTarget] = useState<string>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAlias(editing?.header_alias ?? '');
      setTarget(editing?.target_field ?? prefilledTarget ?? '');
      setNote(editing?.note ?? '');
    }
  }, [open, editing, prefilledTarget]);

  const normalized = normalizeAlias(ctx, alias);

  const conflict = existing.find(
    (m) => ctxMatches(m, ctx) && m.header_alias === normalized && m.id !== editing?.id,
  );

  const onSave = async () => {
    if (!normalized) { toast({ title: 'Alias required', variant: 'destructive' }); return; }
    if (!target) { toast({ title: 'Target field required', variant: 'destructive' }); return; }
    if (conflict) { toast({ title: 'Duplicate alias', description: `Already mapped to ${conflict.target_field}`, variant: 'destructive' }); return; }

    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from('import_header_mappings')
        .update({
          header_alias: normalized,
          target_field: target,
          note: note || null,
          updated_by: userId,
        })
        .eq('id', editing.id);
      setSaving(false);
      if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Mapping updated' });
    } else {
      const { error } = await supabase
        .from('import_header_mappings')
        .insert({
          module: ctx.module,
          sub_module: ctx.module === 'docs' ? ctx.sub_module : null,
          header_alias: normalized,
          target_field: target,
          note: note || null,
          updated_by: userId,
        });
      setSaving(false);
      if (error) { toast({ title: 'Create failed', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'Mapping added' });
    }
    onSaved();
    onClose();
  };

  const targetLocked = !!lockTarget && !editing;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Edit Mapping' : 'Add Alias'} — {ctxLabel(ctx)}
            {targetLocked && target && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                → <code className="bg-muted px-1 rounded">{target}</code>
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Header Alias (raw — will be normalized)</Label>
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="e.g. HDEC PIC"
              autoFocus
            />
            {alias && (
              <p className="text-xs text-muted-foreground">
                Stored as: <code className="bg-muted px-1 rounded">{normalized}</code>
              </p>
            )}
            {conflict && (
              <p className="text-xs text-destructive">
                Conflict: alias already maps to <code>{conflict.target_field}</code>
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Target Field</Label>
            <Select value={target} onValueChange={setTarget} disabled={targetLocked}>
              <SelectTrigger><SelectValue placeholder="Select system field…" /></SelectTrigger>
              <SelectContent>
                {fieldList.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
                {customOptions.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs text-muted-foreground border-t mt-1">Custom Fields</div>
                    {customOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            {targetLocked && (
              <p className="text-[11px] text-muted-foreground">
                Target field is locked. Adding a new alias for this field.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this alias exists…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !!conflict}>{editing ? 'Save' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
