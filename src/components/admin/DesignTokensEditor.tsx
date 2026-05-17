import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Palette, RotateCcw, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  DEFAULT_PPT_COLORS,
  dbKeyForField,
  fetchPptColorTokens,
  invalidatePptColorCache,
  type PptColorTokens,
} from '@/lib/design-tokens';

interface DesignTokensEditorProps {
  embedded?: boolean;
}

interface FieldDef {
  key: keyof PptColorTokens;
  label: string;
}

const GROUPS: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: 'Surfaces',
    fields: [
      { key: 'bgBody', label: 'Slide BG' },
      { key: 'cardBody', label: 'Card Fill' },
      { key: 'cardBorder', label: 'Card Border' },
      { key: 'cardAlert', label: 'Card Alert' },
    ],
  },
  {
    title: 'Text',
    fields: [
      { key: 'textPrimary', label: 'Primary' },
      { key: 'textSecondary', label: 'Secondary' },
      { key: 'textMuted', label: 'Muted' },
    ],
  },
  {
    title: 'Status',
    fields: [
      { key: 'green', label: 'Green / OK' },
      { key: 'magentaBright', label: 'Critical' },
    ],
  },
  {
    title: 'Stages',
    fields: [
      { key: 'stagePreTest', label: 'Pre-Test (T1)' },
      { key: 'stageOfficial', label: 'Official (T2)' },
      { key: 'stageTestReport', label: 'Test Report (R2)' },
    ],
  },
  {
    title: 'Accents',
    fields: [
      { key: 'cyan', label: 'Cyan' },
      { key: 'amber', label: 'Amber' },
    ],
  },
];

const ALL_FIELDS: FieldDef[] = GROUPS.flatMap((g) => g.fields);
const HEX_RE = /^[0-9A-Fa-f]{6}$/;

function normalizeHex(input: string): string {
  return input.trim().replace(/^#/, '').toUpperCase();
}

export default function DesignTokensEditor({ embedded = false }: DesignTokensEditorProps) {
  const { toast } = useToast();
  const [colors, setColors] = useState<PptColorTokens>(DEFAULT_PPT_COLORS);
  const [initial, setInitial] = useState<PptColorTokens>(DEFAULT_PPT_COLORS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      invalidatePptColorCache();
      const c = await fetchPptColorTokens();
      setColors(c);
      setInitial(c);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const dirty = useMemo(
    () => ALL_FIELDS.some((f) => colors[f.key] !== initial[f.key]),
    [colors, initial],
  );

  const allValid = useMemo(
    () => ALL_FIELDS.every((f) => HEX_RE.test(colors[f.key])),
    [colors],
  );

  const setField = (key: keyof PptColorTokens, value: string) => {
    setColors((prev) => ({ ...prev, [key]: normalizeHex(value) }));
  };

  const reset = () => setColors({ ...DEFAULT_PPT_COLORS });

  const save = async () => {
    if (!allValid) {
      toast({ title: 'Invalid color', description: 'All values must be 6-digit hex (e.g. 0A1A40).', variant: 'destructive' });
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;

    setSaving(true);
    try {
      const rows = ALL_FIELDS.map((f) => ({
        key: dbKeyForField(f.key),
        value: colors[f.key],
        category: 'ppt-color',
        description: f.label,
        updated_by: userId,
      }));
      const { error } = await supabase.from('design_tokens').upsert(rows, { onConflict: 'key' });
      if (error) throw error;
      invalidatePptColorCache();
      setInitial(colors);
      toast({ title: 'Design tokens saved', description: 'Next PPT export will use the new colors.' });
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const colorField = (f: FieldDef) => {
    const v = colors[f.key];
    const valid = HEX_RE.test(v);
    return (
      <div key={f.key} className="flex items-center gap-2">
        <Label className="w-28 text-xs shrink-0">{f.label}</Label>
        <input
          type="color"
          value={`#${valid ? v : '000000'}`}
          onChange={(e) => setField(f.key, e.target.value)}
          className="h-8 w-12 cursor-pointer rounded border border-input bg-background shrink-0"
          aria-label={`${f.label} color picker`}
        />
        <Input
          value={v}
          onChange={(e) => setField(f.key, e.target.value)}
          className={`font-mono text-xs h-8 ${valid ? '' : 'border-destructive'}`}
          maxLength={6}
          placeholder="RRGGBB"
        />
      </div>
    );
  };

  const body = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Colors applied to all PPT slides. Hex without #. Mirrors design_guide_v4.yaml tokens.
        </div>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Inputs */}
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g.title} className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.title}
              </div>
              <div className="space-y-2">{g.fields.map(colorField)}</div>
            </div>
          ))}
        </div>

        {/* Live preview — mock dark-theme PPT slide */}
        <div className="rounded-md border overflow-hidden self-start">
          {/* Cover-style */}
          <div className="p-4" style={{ backgroundColor: `#${colors.bgBody}` }}>
            <div style={{ color: `#${colors.textPrimary}`, fontSize: 18, fontWeight: 700 }}>SHAW TOWER</div>
            <div style={{ color: `#${colors.textSecondary}`, fontSize: 12, marginTop: 4 }}>
              Completion Management Report
            </div>
            <div style={{ color: `#${colors.textMuted}`, fontSize: 10, marginTop: 4 }}>
              Generated 2026-05-17 · D-394
            </div>
          </div>
          {/* Content slide */}
          <div className="p-3 space-y-2" style={{ backgroundColor: `#${colors.bgBody}` }}>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Pre-Test', accent: colors.stagePreTest, val: '87.6%' },
                { label: 'Official', accent: colors.stageOfficial, val: '64.2%' },
                { label: 'Report', accent: colors.stageTestReport, val: '41.0%' },
              ].map((c) => (
                <div
                  key={c.label}
                  className="rounded p-2"
                  style={{
                    backgroundColor: `#${colors.cardBody}`,
                    border: `1px solid #${colors.cardBorder}`,
                  }}
                >
                  <div style={{ color: `#${c.accent}`, fontSize: 9, fontWeight: 700 }}>{c.label}</div>
                  <div style={{ color: `#${colors.textPrimary}`, fontSize: 16, fontWeight: 700 }}>{c.val}</div>
                  <div style={{ color: `#${colors.textSecondary}`, fontSize: 8 }}>Done / Plan</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div
                className="rounded p-2"
                style={{ backgroundColor: `#${colors.cardBody}`, border: `1px solid #${colors.cardBorder}` }}
              >
                <div style={{ color: `#${colors.green}`, fontSize: 10, fontWeight: 700 }}>+2.1% On Track</div>
              </div>
              <div
                className="rounded p-2"
                style={{ backgroundColor: `#${colors.cardAlert}`, border: `1px solid #${colors.magentaBright}` }}
              >
                <div style={{ color: `#${colors.magentaBright}`, fontSize: 10, fontWeight: 700 }}>CRITICAL -3.4%</div>
              </div>
            </div>
            <div className="flex gap-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: `#${colors.cyan}`, color: `#${colors.bgBody}` }}>
                cyan
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: `#${colors.amber}`, color: `#${colors.bgBody}` }}>
                amber
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={!dirty || !allValid || saving || loading}>
          {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={reset} disabled={saving || loading}>
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset to defaults
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="rounded-md border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Palette className="h-4 w-4" /> Design Tokens (PPT colors)
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="h-4 w-4" /> Design Tokens
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
