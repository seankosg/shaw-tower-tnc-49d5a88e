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
  fetchPptColorTokens,
  invalidatePptColorCache,
  type PptColorTokens,
} from '@/lib/design-tokens';

interface DesignTokensEditorProps {
  /** When true, render without an outer Card (for inline use inside another card). */
  embedded?: boolean;
}

const FIELDS: Array<{ key: keyof PptColorTokens; label: string; dbKey: string }> = [
  { key: 'primary', label: 'Primary', dbKey: 'ppt.color.primary' },
  { key: 'accent', label: 'Accent', dbKey: 'ppt.color.accent' },
  { key: 'text', label: 'Text', dbKey: 'ppt.color.text' },
  { key: 'muted', label: 'Muted', dbKey: 'ppt.color.muted' },
  { key: 'bg_soft', label: 'Soft BG', dbKey: 'ppt.color.bg_soft' },
  { key: 'danger', label: 'Danger', dbKey: 'ppt.color.danger' },
  { key: 'ok', label: 'OK', dbKey: 'ppt.color.ok' },
];

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
    () => FIELDS.some((f) => colors[f.key] !== initial[f.key]),
    [colors, initial],
  );

  const allValid = useMemo(
    () => FIELDS.every((f) => HEX_RE.test(colors[f.key])),
    [colors],
  );

  const setField = (key: keyof PptColorTokens, value: string) => {
    setColors((prev) => ({ ...prev, [key]: normalizeHex(value) }));
  };

  const reset = () => setColors({ ...DEFAULT_PPT_COLORS });

  const save = async () => {
    if (!allValid) {
      toast({ title: 'Invalid color', description: 'All values must be 6-digit hex (e.g. 1E2761).', variant: 'destructive' });
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;

    setSaving(true);
    try {
      const rows = FIELDS.map((f) => ({
        key: f.dbKey,
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

  const body = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Colors applied to all PPT slides (cover, headers, cards, status). Hex without #.
        </div>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Inputs */}
        <div className="space-y-2">
          {FIELDS.map((f) => {
            const v = colors[f.key];
            const valid = HEX_RE.test(v);
            return (
              <div key={f.key} className="flex items-center gap-2">
                <Label className="w-20 text-xs">{f.label}</Label>
                <input
                  type="color"
                  value={`#${valid ? v : '000000'}`}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border border-input bg-background"
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
          })}
        </div>

        {/* Live preview — mock PPT cover */}
        <div className="rounded-md border overflow-hidden">
          <div
            className="p-4"
            style={{ backgroundColor: `#${colors.primary}`, minHeight: 120 }}
          >
            <div style={{ color: '#FFFFFF', fontSize: 18, fontWeight: 700 }}>SHAW TOWER</div>
            <div style={{ color: '#CADCFC', fontSize: 12, marginTop: 4 }}>Completion Management Report</div>
            <div style={{ color: '#A8B5DA', fontSize: 10, marginTop: 8 }}>Generated: 2026-05-17 · D-394</div>
          </div>
          <div className="p-3 space-y-2" style={{ backgroundColor: '#FFFFFF' }}>
            <div
              className="rounded p-2"
              style={{ backgroundColor: `#${colors.bg_soft}` }}
            >
              <div style={{ color: `#${colors.primary}`, fontSize: 11, fontWeight: 700 }}>Pre-Test (T1)</div>
              <div style={{ color: `#${colors.text}`, fontSize: 20, fontWeight: 700 }}>87.6%</div>
              <div style={{ color: `#${colors.muted}`, fontSize: 10 }}>Done 432 / Plan 500</div>
              <div style={{ color: `#${colors.ok}`, fontSize: 10, fontWeight: 700 }}>Variance +2.1%</div>
              <div style={{ color: `#${colors.danger}`, fontSize: 10, fontWeight: 700 }}>Variance -3.4%</div>
            </div>
            <div className="flex gap-1">
              <span className="px-2 py-0.5 rounded text-[10px] text-white" style={{ backgroundColor: `#${colors.accent}` }}>
                Accent chip
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
