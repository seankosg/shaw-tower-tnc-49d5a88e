import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RotateCcw, Save, Search, Type } from 'lucide-react';
import {
  TEXT_TOKEN_REGISTRY, COMMON_TOKENS, COMMON_SLIDE_KEY, type TextToken,
} from '@/lib/text-token-registry';
import type { SlideKey } from '@/lib/ppt-builder';
import { SLIDE_REGISTRY } from '@/lib/slide-registry';
import {
  fetchTextOverrides,
  saveTextOverride,
  deleteTextOverride,
} from '@/lib/slide-text-overrides';

interface Props {
  embedded?: boolean;
}

export default function SlideTextEditor({ embedded = false }: Props) {
  const { toast } = useToast();

  // Slides that actually have overridable fields, plus the special "Common" section
  const slideOptions = useMemo(() => {
    const real = (Object.keys(TEXT_TOKEN_REGISTRY) as SlideKey[])
      .filter((k) => TEXT_TOKEN_REGISTRY[k].length > 0)
      .map((k) => ({ key: k as string, label: SLIDE_REGISTRY[k]?.label ?? k, number: SLIDE_REGISTRY[k]?.number ?? 99 }))
      .sort((a, b) => a.number - b.number);
    return [
      { key: COMMON_SLIDE_KEY, label: 'Common (all slides)', number: 0 },
      ...real,
    ];
  }, []);

  const [slideKey, setSlideKey] = useState<string>(COMMON_SLIDE_KEY);
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [overriddenOnly, setOverriddenOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [data, auth] = await Promise.all([
        fetchTextOverrides(true),
        supabase.auth.getUser(),
      ]);
      let senior = false;
      const uid = auth.data.user?.id;
      if (uid) {
        const { data: r } = await supabase.rpc('is_senior_or_above', { _user_id: uid });
        senior = !!r;
      }
      if (!cancelled) {
        setOverrides(data);
        setCanEdit(senior);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reset drafts when slide changes / overrides reload
  useEffect(() => {
    const slideOv = overrides[slideKey] ?? {};
    const fields = slideKey === COMMON_SLIDE_KEY ? COMMON_TOKENS : (TEXT_TOKEN_REGISTRY[slideKey] ?? []);
    const next: Record<string, string> = {};
    for (const f of fields) next[f.key] = slideOv[f.key] ?? '';
    setDrafts(next);
  }, [slideKey, overrides]);

  const allFields: TextToken[] = slideKey === COMMON_SLIDE_KEY
    ? COMMON_TOKENS
    : (TEXT_TOKEN_REGISTRY[slideKey] ?? []);

  const fields = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allFields.filter((f) => {
      if (q && !`${f.label} ${f.key}`.toLowerCase().includes(q)) return false;
      if (overriddenOnly) {
        const v = overrides[slideKey]?.[f.key];
        if (!(typeof v === 'string' && v.length > 0)) return false;
      }
      return true;
    });
  }, [allFields, search, overriddenOnly, overrides, slideKey]);

  const onChange = (k: string, v: string) => setDrafts((d) => ({ ...d, [k]: v }));

  const onSave = async (fieldKey: string) => {
    const value = drafts[fieldKey] ?? '';
    if (value.trim().length === 0) {
      toast({ title: 'Empty value — use Reset to clear', variant: 'destructive' });
      return;
    }
    setBusyKey(fieldKey);
    try {
      await saveTextOverride(slideKey, fieldKey, value);
      setOverrides((o) => ({ ...o, [slideKey]: { ...(o[slideKey] ?? {}), [fieldKey]: value } }));
      toast({ title: 'Saved', description: `${slideKey} · ${fieldKey}` });
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : 'Unknown', variant: 'destructive' });
    } finally {
      setBusyKey(null);
    }
  };

  const onReset = async (fieldKey: string) => {
    setBusyKey(fieldKey);
    try {
      await deleteTextOverride(slideKey, fieldKey);
      setOverrides((o) => {
        const next = { ...o };
        if (next[slideKey]) {
          const { [fieldKey]: _drop, ...rest } = next[slideKey];
          void _drop;
          next[slideKey] = rest;
        }
        return next;
      });
      setDrafts((d) => ({ ...d, [fieldKey]: '' }));
      toast({ title: 'Reset to default' });
    } catch (e) {
      toast({ title: 'Reset failed', description: e instanceof Error ? e.message : 'Unknown', variant: 'destructive' });
    } finally {
      setBusyKey(null);
    }
  };

  const body = (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr,1fr,auto] sm:items-end">
        <div>
          <Label className="text-xs text-muted-foreground">Slide</Label>
          <Select value={slideKey} onValueChange={(v) => setSlideKey(v)} disabled={loading}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {slideOptions.map(({ key, label, number }) => (
                <SelectItem key={key} value={key}>
                  {key === COMMON_SLIDE_KEY ? '★' : String(number).padStart(2, '0')} · {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Search fields</Label>
          <div className="relative mt-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by label / key"
              className="pl-7"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Switch
            id="overridden-only"
            checked={overriddenOnly}
            onCheckedChange={setOverriddenOnly}
          />
          <Label htmlFor="overridden-only" className="text-xs text-muted-foreground">
            Overridden only
          </Label>
        </div>
      </div>

      {!canEdit && !loading && (
        <div className="rounded-md border border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">
          Senior User role or higher required to edit — view-only mode.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : fields.length === 0 ? (
        <div className="text-sm text-muted-foreground p-4">
          {allFields.length === 0
            ? 'No overridable fields for this slide.'
            : 'No fields match your filter.'}
        </div>
      ) : (
        <div className="space-y-4">
          {fields.map((f) => {
            const current = overrides[slideKey]?.[f.key];
            const isOverridden = typeof current === 'string' && current.length > 0;
            const draft = drafts[f.key] ?? '';
            const dirty = draft !== (current ?? '');
            return (
              <div key={f.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">{f.label}</Label>
                  {isOverridden ? (
                    <span className="text-[10px] uppercase tracking-wider text-amber-600">Custom</span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Default</span>
                  )}
                </div>
                {f.multiline ? (
                  <Textarea
                    value={draft}
                    onChange={(e) => onChange(f.key, e.target.value)}
                    placeholder={f.default}
                    disabled={!canEdit || busyKey === f.key}
                    rows={2}
                  />
                ) : (
                  <Input
                    value={draft}
                    onChange={(e) => onChange(f.key, e.target.value)}
                    placeholder={f.default}
                    disabled={!canEdit || busyKey === f.key}
                  />
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground truncate">
                    Default: <span className="italic">{f.default || '(empty)'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onReset(f.key)}
                      disabled={!canEdit || busyKey === f.key || !isOverridden}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onSave(f.key)}
                      disabled={!canEdit || busyKey === f.key || !dirty}
                    >
                      {busyKey === f.key
                        ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        : <Save className="h-3.5 w-3.5 mr-1.5" />}
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="rounded-md border bg-background p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold">Slide Text Overrides</div>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Type className="h-4 w-4" /> Slide Text Overrides
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
