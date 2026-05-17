import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Copy, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { SLIDE_REGISTRY, DEFAULT_SLIDE_ORDER } from '@/lib/slide-registry';
import { generateSlideCode, type SlideCodegenResult, type SlideDataSource } from '@/lib/slide-codegen';

interface Props {
  embedded?: boolean;
}

const DATA_SOURCES: { key: SlideDataSource; label: string }[] = [
  { key: 'tnc', label: 'T&C' },
  { key: 'defect', label: 'Defect' },
  { key: 'docs', label: 'Docs' },
  { key: 'punch', label: 'Punch' },
];

export default function SlideCodegen({ embedded = false }: Props) {
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [title, setTitle] = useState('');
  const [position, setPosition] = useState<number>(DEFAULT_SLIDE_ORDER.length);
  const [sources, setSources] = useState<Record<SlideDataSource, boolean>>({
    tnc: true, defect: false, docs: false, punch: false,
  });
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<SlideCodegenResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data } = await supabase.rpc('has_role', { _user_id: uid, _role: 'admin' });
      if (!cancelled) setIsAdmin(!!data);
    })();
    return () => { cancelled = true; };
  }, []);

  const orderedSlides = useMemo(
    () => DEFAULT_SLIDE_ORDER.map((k, i) => ({ key: k, number: i + 1, label: SLIDE_REGISTRY[k]?.label ?? k })),
    [],
  );

  const selectedSources = (Object.entries(sources) as [SlideDataSource, boolean][])
    .filter(([, v]) => v).map(([k]) => k);

  const canGenerate = isAdmin && !generating && title.trim().length > 0
    && description.trim().length >= 5 && selectedSources.length > 0;

  const onGenerate = async () => {
    setGenerating(true);
    try {
      const registryDump = JSON.stringify(
        Object.values(SLIDE_REGISTRY).map((m) => ({ key: m.key, label: m.label, category: m.category })),
      );
      const res = await generateSlideCode({
        title: title.trim(),
        position,
        dataSources: selectedSources,
        description: description.trim(),
        slideRegistry: registryDump,
      });
      setResult(res);
      toast({ title: 'Slide code generated' });
    } catch (e) {
      toast({
        title: 'Generation failed',
        description: e instanceof Error ? e.message : 'Unknown',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const onCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.functionCode);
      toast({ title: 'Copied to clipboard' });
    } catch (e) {
      toast({
        title: 'Copy failed',
        description: e instanceof Error ? e.message : 'Unknown',
        variant: 'destructive',
      });
    }
  };

  const registryHint = result
    ? `${result.suggestedKey}: {
  key: '${result.suggestedKey}',
  label: '${result.suggestedLabel.replace(/'/g, "\\'")}',
  category: 'tnc', // adjust as needed
  build: (ctx) => buildSlide_${result.suggestedKey}(ctx),
}`
    : '';

  const body = (
    <div className="space-y-4">
      {!isAdmin && (
        <div className="rounded-md border border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">
          Admins only — view-only mode.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="codegen-title" className="text-xs">Slide Title</Label>
          <Input
            id="codegen-title"
            placeholder="e.g. T&C vs Defect Comparison"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!isAdmin || generating}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Insert after slide</Label>
          <Select
            value={String(position)}
            onValueChange={(v) => setPosition(Number(v))}
            disabled={!isAdmin || generating}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {orderedSlides.map((s) => (
                <SelectItem key={s.key} value={String(s.number)}>
                  {s.number}. {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Use data from</Label>
        <div className="flex flex-wrap gap-4">
          {DATA_SOURCES.map((d) => (
            <label key={d.key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={sources[d.key]}
                onCheckedChange={(v) => setSources((s) => ({ ...s, [d.key]: !!v }))}
                disabled={!isAdmin || generating}
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="codegen-desc" className="text-xs">Description (natural language)</Label>
        <Textarea
          id="codegen-desc"
          rows={5}
          placeholder='e.g. "A comparison slide showing T&C and Defect progress side by side with current % and required pace"'
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!isAdmin || generating}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={onGenerate} disabled={!canGenerate}>
          {generating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
          Generate with Claude
        </Button>
      </div>

      {result && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Generated Code</div>
            <Button size="sm" variant="outline" onClick={onCopy}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
            </Button>
          </div>
          <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap">
{result.functionCode}
          </pre>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Suggested key: </span>
              <code className="font-mono">{result.suggestedKey}</code>
            </div>
            <div>
              <span className="text-muted-foreground">Suggested label: </span>
              <span>{result.suggestedLabel}</span>
            </div>
          </div>

          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-2">
            <div className="font-semibold">How to add this slide</div>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Copy the code above.</li>
              <li>Paste at the bottom of <code className="font-mono">src/lib/ppt-builder.ts</code> in the Lovable editor.</li>
              <li>
                Add to <code className="font-mono">SLIDE_REGISTRY</code> in <code className="font-mono">src/lib/slide-registry.ts</code>:
                <pre className="mt-1 rounded bg-background/60 p-2 font-mono whitespace-pre-wrap">{registryHint}</pre>
              </li>
              <li>The slide will appear in Slide Composer automatically.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="rounded-md border bg-background p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold">New Slide Generator</div>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wand2 className="h-4 w-4" /> New Slide Generator
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
