import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { findEditDistanceMatch, masterNameKey } from '@/lib/master-name-match';
import { SimilarMasterDialog } from '@/components/import/SimilarMasterDialog';
import type { SimilarMasterDecision, SimilarDecisionAction } from '@/lib/subcontractor-master-sync';

type ParsedRow = {
  team: 'Arch' | 'Mech' | 'Elec';
  subcontractor: string;
  trade: string | null;
  tnc: number;
  defect: number;
  post_top: number;
  total: number;
};

type ParsedSection = {
  team: 'Arch' | 'Mech' | 'Elec';
  rows: ParsedRow[];
  sub_total: { tnc: number; defect: number; post_top: number; total: number };
};

type ParsedDmr = {
  report_date: string;
  sections: ParsedSection[];
  grand_total: { tnc: number; defect: number; post_top: number; total: number };
};

const SECTION_FROM_TEAM = { Construction: 'Arch', Mechanical: 'Mech', Electrical: 'Elec' };
const TEAM_LABEL = { Arch: 'Construction', Mech: 'Mechanical', Elec: 'Electrical' } as const;

export default function DmrImportPage() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<ParsedDmr | null>(null);
  const [reportDate, setReportDate] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [similarDecisions, setSimilarDecisions] = useState<SimilarMasterDecision[]>([]);

  function onPick(f: File | null) {
    setParsed(null);
    setExistingKeys(new Set());
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function normalizeSubcontractors(p: ParsedDmr): Promise<ParsedDmr> {
    const { data: masters } = await supabase
      .from('subcontractor_master')
      .select('name')
      .eq('is_active', true);
    const map = new Map<string, string>();
    (masters ?? []).forEach((m: any) => {
      if (m?.name) map.set(String(m.name).trim().toLowerCase(), String(m.name));
    });
    let replaced = 0;
    const sections = p.sections.map(s => ({
      ...s,
      rows: s.rows.map(r => {
        const key = (r.subcontractor ?? '').trim().toLowerCase();
        const canonical = map.get(key);
        if (canonical && canonical !== r.subcontractor) {
          replaced += 1;
          return { ...r, subcontractor: canonical };
        }
        return r;
      }),
    }));
    if (replaced > 0) {
      toast({ title: 'Names normalized', description: `${replaced} subcontractor name(s) matched to master values.` });
    }
    return { ...p, sections };
  }

  /** Detect imported subcontractor names within 2 edits of an existing master
   *  (but not exact-case match — those are already replaced). */
  async function detectDmrSimilar(p: ParsedDmr): Promise<SimilarMasterDecision[]> {
    const { data: masters } = await supabase
      .from('subcontractor_master')
      .select('id, name, type')
      .eq('is_active', true);
    const subMasters = ((masters ?? []) as any[]).filter((m) => (m.type ?? 'sub') === 'sub');
    const exact = new Set(subMasters.map((m) => masterNameKey(m.name)));
    const seen = new Map<string, SimilarMasterDecision>();
    for (const s of p.sections) {
      for (const r of s.rows) {
        const name = r.subcontractor?.trim();
        if (!name || exact.has(masterNameKey(name))) continue;
        const key = `sub:${masterNameKey(name)}`;
        if (seen.has(key)) continue;
        const match = findEditDistanceMatch(name, subMasters, 2);
        if (match) {
          seen.set(key, {
            key, kind: 'subcontractor',
            importedName: name, existingName: match.candidate.name,
            distance: match.distance,
          });
        }
      }
    }
    return [...seen.values()];
  }

  function applyDecisionsToParsed(p: ParsedDmr, decisions: SimilarMasterDecision[]): ParsedDmr {
    const byKey = new Map(decisions.map((d) => [`sub:${masterNameKey(d.importedName)}`, d]));
    return {
      ...p,
      sections: p.sections.map((s) => ({
        ...s,
        rows: s.rows.map((r) => {
          const d = byKey.get(`sub:${masterNameKey(r.subcontractor)}`);
          if (d?.action === 'use_existing') return { ...r, subcontractor: d.existingName };
          return r;
        }),
      })),
    };
  }

  async function refreshExistingKeys(p: ParsedDmr) {
    const flat = flatten(p, p.report_date);
    const keys = flat.map(r => `${r.report_date}|${r.subcontractor}|${r.workplace}`);
    const { data: existing } = await supabase
      .from('dmr_entries')
      .select('report_date, subcontractor, workplace')
      .eq('report_date', p.report_date);
    const set = new Set((existing ?? []).map(e => `${e.report_date}|${e.subcontractor}|${e.workplace}`));
    setExistingKeys(new Set(keys.filter(k => set.has(k))));
  }

  async function uploadAndParse() {
    if (!file || !user) return;
    setParsing(true);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `${user.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from('dmr-uploads').upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      setStoragePath(path);

      const { data, error } = await supabase.functions.invoke('dmr-image-parse', {
        body: { storage_path: path },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const result = await normalizeSubcontractors(data.data as ParsedDmr);
      setParsed(result);
      setReportDate(result.report_date);

      await refreshExistingKeys(result);
      toast({ title: 'Parsed', description: `${result.sections.reduce((a, s) => a + s.rows.length, 0)} companies extracted.` });

      // Detect possible misspellings vs existing master entries (≤2 char edits).
      const decisions = await detectDmrSimilar(result);
      if (decisions.length > 0) setSimilarDecisions(decisions);
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Parse failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  }

  function setDecisionAction(key: string, action: SimilarDecisionAction) {
    setSimilarDecisions((cur) => cur.map((d) => d.key === key ? { ...d, action } : d));
  }
  async function confirmSimilarDecisions() {
    if (!parsed) { setSimilarDecisions([]); return; }
    const next = applyDecisionsToParsed(parsed, similarDecisions);
    setParsed(next);
    await refreshExistingKeys(next);
    setSimilarDecisions([]);
  }
  function cancelSimilarDecisions() {
    // Treat cancel as "register new for all" — keep imported names as-is.
    setSimilarDecisions([]);
  }


  function updateRow(team: string, idx: number, patch: Partial<ParsedRow>) {
    if (!parsed) return;
    setParsed({
      ...parsed,
      sections: parsed.sections.map(s =>
        s.team !== team ? s : { ...s, rows: s.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)) },
      ),
    });
  }

  function resolveTrade(team: string, subcontractor: string, rawTrade: string | null): string | null {
    if (rawTrade && rawTrade.trim()) return rawTrade;
    const TRADE_BY_SUB: Record<string, string> = {
      MERO: 'Façade', Mero: 'Façade',
      PureTech: 'Elec', Puretech: 'Elec',
      'Schindler Lift': 'Lift', SCHINDLER: 'Lift',
      ASK: 'PSG', RICO: 'FP',
      Kurihara: 'ACMV', 'Kurihara (ACMV)': 'ACMV',
    };
    if (TRADE_BY_SUB[subcontractor]) return TRADE_BY_SUB[subcontractor];
    if (team === 'Arch') return 'Arch';
    return null;
  }

  function flatten(p: ParsedDmr, date: string) {
    const out: Array<{ report_date: string; team: string; trade: string | null; subcontractor: string; workplace: string; manpower: number }> = [];
    for (const s of p.sections) {
      for (const r of s.rows) {
        const trade = resolveTrade(s.team, r.subcontractor, r.trade);
        out.push({ report_date: date, team: s.team, trade, subcontractor: r.subcontractor, workplace: 'T&C', manpower: r.tnc ?? 0 });
        out.push({ report_date: date, team: s.team, trade, subcontractor: r.subcontractor, workplace: 'Defect', manpower: r.defect ?? 0 });
        out.push({ report_date: date, team: s.team, trade, subcontractor: r.subcontractor, workplace: 'Post TOP', manpower: r.post_top ?? 0 });
      }
    }
    return out;
  }

  function validate(p: ParsedDmr) {
    const issues: string[] = [];
    for (const s of p.sections) {
      let tnc = 0, def = 0, pt = 0;
      for (const r of s.rows) {
        const sum = (r.tnc ?? 0) + (r.defect ?? 0) + (r.post_top ?? 0);
        if (sum !== r.total) issues.push(`${s.team} / ${r.subcontractor}: row sum ${sum} ≠ TOTAL ${r.total}`);
        tnc += r.tnc; def += r.defect; pt += r.post_top;
      }
      if (tnc !== s.sub_total.tnc) issues.push(`${s.team} Sub-Total T&C ${tnc} ≠ ${s.sub_total.tnc}`);
      if (def !== s.sub_total.defect) issues.push(`${s.team} Sub-Total Defect ${def} ≠ ${s.sub_total.defect}`);
      if (pt !== s.sub_total.post_top) issues.push(`${s.team} Sub-Total Post TOP ${pt} ≠ ${s.sub_total.post_top}`);
    }
    const gtnc = p.sections.reduce((a, s) => a + s.sub_total.tnc, 0);
    const gdef = p.sections.reduce((a, s) => a + s.sub_total.defect, 0);
    const gpt = p.sections.reduce((a, s) => a + s.sub_total.post_top, 0);
    if (gtnc !== p.grand_total.tnc) issues.push(`Grand Total T&C ${gtnc} ≠ ${p.grand_total.tnc}`);
    if (gdef !== p.grand_total.defect) issues.push(`Grand Total Defect ${gdef} ≠ ${p.grand_total.defect}`);
    if (gpt !== p.grand_total.post_top) issues.push(`Grand Total Post TOP ${gpt} ≠ ${p.grand_total.post_top}`);
    return issues;
  }

  async function commit() {
    if (!parsed || !reportDate) return;
    setSaving(true);
    try {
      let rows = flatten(parsed, reportDate).map(r => ({ ...r, source_image_path: storagePath, created_by: user?.id ?? null }));
      if (!overwrite && existingKeys.size > 0) {
        rows = rows.filter(r => !existingKeys.has(`${r.report_date}|${r.subcontractor}|${r.workplace}`));
      }
      if (!rows.length) {
        toast({ title: 'Nothing to insert', description: 'All rows already exist for this date.' });
        return;
      }
      if (overwrite && existingKeys.size > 0) {
        // delete the overlapping keys first
        const keys = Array.from(existingKeys);
        for (const k of keys) {
          const [d, s, w] = k.split('|');
          await supabase.from('dmr_entries').delete().eq('report_date', d).eq('subcontractor', s).eq('workplace', w);
        }
      }
      const { error } = await supabase.from('dmr_entries').insert(rows);
      if (error) throw error;
      toast({ title: 'Saved', description: `${rows.length} rows appended.` });
      setParsed(null);
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setStoragePath(null);
      setExistingKeys(new Set());
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Save failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const issues = parsed ? validate(parsed) : [];

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">DMR Import</h1>
        <p className="text-xs text-muted-foreground">Upload a Daily Manpower Report image — AI parses it into rows for the DMR Raw Data table.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-md border p-3">
          <div className="text-sm font-medium">1. Upload image</div>
          <Input type="file" accept="image/*" onChange={e => onPick(e.target.files?.[0] ?? null)} />
          {previewUrl && (
            <img src={previewUrl} alt="DMR preview" className="max-h-[400px] w-full rounded border object-contain" />
          )}
          <Button onClick={uploadAndParse} disabled={!file || parsing} className="w-full">
            {parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {parsing ? 'Parsing…' : 'Upload & Parse'}
          </Button>
        </div>

        <div className="space-y-3 rounded-md border p-3">
          <div className="text-sm font-medium">2. Verify & commit</div>
          {!parsed && <div className="py-10 text-center text-xs text-muted-foreground">No data yet — upload a report first.</div>}
          {parsed && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs">Report date</label>
                <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="h-8 w-40" />
              </div>
              {issues.length === 0 ? (
                <div className="flex items-center gap-2 rounded bg-green-50 px-2 py-1 text-xs text-green-700 dark:bg-green-950/30 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4" /> All sub-totals and grand total match.
                </div>
              ) : (
                <div className="space-y-1 rounded bg-red-50 p-2 text-[11px] text-red-700 dark:bg-red-950/30 dark:text-red-300">
                  <div className="flex items-center gap-1 font-medium"><AlertCircle className="h-3.5 w-3.5" /> Validation issues</div>
                  {issues.map((m, i) => <div key={i}>· {m}</div>)}
                </div>
              )}
              {existingKeys.size > 0 && (
                <div className="rounded bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  {existingKeys.size} rows already exist for {reportDate}.
                  <label className="ml-2 inline-flex items-center gap-1">
                    <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} />
                    Overwrite
                  </label>
                </div>
              )}
              <Button onClick={commit} disabled={saving} className="w-full">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save to DMR Raw Data
              </Button>
            </>
          )}
        </div>
      </div>

      {parsed && (
        <div className="space-y-3">
          {parsed.sections.map(s => (
            <div key={s.team} className="rounded-md border">
              <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-sm font-medium">
                <span>{TEAM_LABEL[s.team]} ({s.team})</span>
                <Badge variant="outline">Sub-Total {s.sub_total.total}</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subcontractor</TableHead>
                    <TableHead>Trade</TableHead>
                    <TableHead className="w-20 text-right">T&C</TableHead>
                    <TableHead className="w-20 text-right">Defect</TableHead>
                    <TableHead className="w-24 text-right">Post TOP</TableHead>
                    <TableHead className="w-20 text-right">TOTAL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.rows.map((r, i) => {
                    const sum = (r.tnc ?? 0) + (r.defect ?? 0) + (r.post_top ?? 0);
                    const ok = sum === r.total;
                    return (
                      <TableRow key={`${s.team}-${i}`} className={ok ? '' : 'bg-red-50 dark:bg-red-950/20'}>
                        <TableCell>
                          <Input value={r.subcontractor} onChange={e => updateRow(s.team, i, { subcontractor: e.target.value })} className="h-7" />
                        </TableCell>
                        <TableCell>
                          <Input value={r.trade ?? ''} onChange={e => updateRow(s.team, i, { trade: e.target.value || null })} className="h-7" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={r.tnc} onChange={e => updateRow(s.team, i, { tnc: Number(e.target.value) || 0 })} className="h-7 text-right" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={r.defect} onChange={e => updateRow(s.team, i, { defect: Number(e.target.value) || 0 })} className="h-7 text-right" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={r.post_top} onChange={e => updateRow(s.team, i, { post_top: Number(e.target.value) || 0 })} className="h-7 text-right" />
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${ok ? '' : 'text-red-600 font-semibold'}`}>{r.total}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ))}
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            Grand Total — T&C {parsed.grand_total.tnc} · Defect {parsed.grand_total.defect} · Post TOP {parsed.grand_total.post_top} · <strong>{parsed.grand_total.total}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
