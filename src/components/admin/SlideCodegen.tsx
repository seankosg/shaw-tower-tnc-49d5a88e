import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Check, ChevronDown, Loader2, RotateCcw, Sparkles, UploadCloud, Wand2,
} from 'lucide-react';
import { SLIDE_REGISTRY, DEFAULT_SLIDE_ORDER } from '@/lib/slide-registry';
import { fetchCustomSlides } from '@/lib/custom-slides-cache';
import {
  addSlideToReport,
  generateSlideSpec,
  type SlideCodegenResult,
  type SlideDataSource,
} from '@/lib/slide-codegen';
import { cn } from '@/lib/utils';

interface Props {
  embedded?: boolean;
  onAdded?: () => void | Promise<void>;
}

const DATA_SOURCES: { key: SlideDataSource; label: string }[] = [
  { key: 'tnc', label: 'T&C' },
  { key: 'defect', label: 'Defect' },
  { key: 'docs', label: 'Docs' },
  { key: 'punch', label: 'Punch' },
];

type Stage = 'describe' | 'preview' | 'added';

function StepBadge({ n, label, state }: { n: number; label: string; state: 'pending' | 'active' | 'done' }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold border',
          state === 'done' && 'bg-primary text-primary-foreground border-primary',
          state === 'active' && 'bg-primary/10 text-primary border-primary',
          state === 'pending' && 'bg-muted text-muted-foreground border-border',
        )}
      >
        {state === 'done' ? <Check className="h-3.5 w-3.5" /> : n}
      </div>
      <span className={cn('text-xs font-medium', state === 'pending' && 'text-muted-foreground')}>{label}</span>
    </div>
  );
}

export default function SlideCodegen({ embedded = false, onAdded }: Props) {
  const { toast } = useToast();
  const [canGen, setCanGen] = useState(false);
  const [title, setTitle] = useState('');
  const [position, setPosition] = useState<number>(DEFAULT_SLIDE_ORDER.length);
  const [sources, setSources] = useState<Record<SlideDataSource, boolean>>({
    tnc: true, defect: false, docs: false, punch: false,
  });
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<SlideCodegenResult | null>(null);
  const [stage, setStage] = useState<Stage>('describe');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const [a, s, d] = await Promise.all([
        supabase.rpc('has_role', { _user_id: uid, _role: 'admin' }),
        supabase.rpc('has_role', { _user_id: uid, _role: 'superuser' }),
        supabase.rpc('has_role', { _user_id: uid, _role: 'd_superuser' }),
      ]);
      if (!cancelled) setCanGen(!!a.data || !!s.data || !!d.data);
    })();
    return () => { cancelled = true; };
  }, []);

  const orderedSlides = useMemo(
    () => DEFAULT_SLIDE_ORDER.map((k, i) => ({ key: k, number: i + 1, label: SLIDE_REGISTRY[k]?.label ?? k })),
    [],
  );

  const selectedSources = (Object.entries(sources) as [SlideDataSource, boolean][])
    .filter(([, v]) => v).map(([k]) => k);

  const canSubmit = canGen && !generating && title.trim().length > 0
    && description.trim().length >= 5 && selectedSources.length > 0;

  const onGenerate = async () => {
    setGenerating(true);
    try {
      const customs = await fetchCustomSlides();
      const existingKeys = [...Object.keys(SLIDE_REGISTRY), ...customs.map((c) => c.key)];
      const res = await generateSlideSpec({
        title: title.trim(),
        position,
        dataSources: selectedSources,
        description: description.trim(),
        existingKeys,
      });
      setResult(res);
      setStage('preview');
      toast({ title: '미리보기가 준비되었습니다' });
    } catch (e) {
      toast({
        title: '생성 실패',
        description: e instanceof Error ? e.message : 'Unknown',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const onAddToReport = async () => {
    if (!result) return;
    setAdding(true);
    try {
      await addSlideToReport({
        spec: result.spec,
        suggestedKey: result.suggestedKey,
        suggestedLabel: result.suggestedLabel,
      });
      setStage('added');
      toast({ title: '슬라이드가 Report에 추가되었습니다' });
      if (onAdded) await onAdded();
    } catch (e) {
      toast({
        title: '추가 실패',
        description: e instanceof Error ? e.message : 'Unknown',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  };

  const onStartOver = () => {
    setResult(null);
    setStage('describe');
  };

  const body = (
    <div className="space-y-4">
      {!canGen && (
        <div className="rounded-md border border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">
          D.Super User 이상만 새 슬라이드를 만들 수 있습니다.
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center gap-4 rounded-md border bg-muted/20 px-3 py-2">
        <StepBadge n={1} label="Describe" state={stage === 'describe' ? 'active' : 'done'} />
        <div className="h-px flex-1 bg-border" />
        <StepBadge n={2} label="Preview" state={stage === 'describe' ? 'pending' : stage === 'preview' ? 'active' : 'done'} />
        <div className="h-px flex-1 bg-border" />
        <StepBadge n={3} label="Add" state={stage === 'added' ? 'done' : 'pending'} />
      </div>

      {/* STEP 1 */}
      {stage === 'describe' && (
        <div className="space-y-3 rounded-md border p-4">
          <div className="text-sm font-semibold">1. 어떤 슬라이드를 만들고 싶으신가요?</div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="codegen-title" className="text-xs">슬라이드 제목</Label>
              <Input
                id="codegen-title"
                placeholder="예: T&C vs Defect 비교"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!canGen || generating}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">어느 슬라이드 뒤에 넣을까요?</Label>
              <Select
                value={String(position)}
                onValueChange={(v) => setPosition(Number(v))}
                disabled={!canGen || generating}
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
            <Label className="text-xs">어떤 데이터를 사용할까요?</Label>
            <div className="flex flex-wrap gap-4">
              {DATA_SOURCES.map((d) => (
                <label key={d.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={sources[d.key]}
                    onCheckedChange={(v) => setSources((s) => ({ ...s, [d.key]: !!v }))}
                    disabled={!canGen || generating}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="codegen-desc" className="text-xs">자연어로 설명해 주세요</Label>
            <Textarea
              id="codegen-desc"
              rows={4}
              placeholder='예: "T&C와 Defect 진행률을 좌우 카드로 비교, 현재 % 와 목표 pace 표시"'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canGen || generating}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={onGenerate} disabled={!canSubmit}>
              {generating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
              미리보기 만들기
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2 — Preview */}
      {stage === 'preview' && result && (
        <div className="space-y-3 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">2. 미리보기 — 이렇게 만들어졌습니다</div>
            <Button size="sm" variant="ghost" onClick={onStartOver}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> 다시 만들기
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">슬라이드 이름</div>
              <div className="font-medium">{result.suggestedLabel}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">사용 데이터</div>
              <div className="flex gap-1 flex-wrap mt-0.5">
                {selectedSources.map((s) => (
                  <Badge key={s} variant="secondary">{s.toUpperCase()}</Badge>
                ))}
              </div>
            </div>
          </div>

          {result.summary && (
            <div className="rounded-md bg-muted/40 border p-3 text-sm">
              <div className="text-xs text-muted-foreground mb-1">AI 요약</div>
              {result.summary}
            </div>
          )}

          <div className="rounded-md border p-3 bg-card space-y-2">
            <div className="text-xs text-muted-foreground">레이아웃: <code className="font-mono">{result.spec.layout}</code> · 블록 {result.spec.blocks.length}개</div>
            <div className="flex flex-wrap gap-1">
              {result.spec.blocks.map((b, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{b.type}</Badge>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              실제 PPT 외관은 <b>Report Generator → Export PPT</b> 로 확인할 수 있습니다.
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onStartOver} disabled={adding}>
              마음에 안 들어요
            </Button>
            <Button onClick={onAddToReport} disabled={!canGen || adding}>
              {adding ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-1.5" />}
              Report에 추가하기
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3 — Added */}
      {stage === 'added' && result && (
        <div className="space-y-3 rounded-md border border-primary/40 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Check className="h-4 w-4" /> 3. 추가 완료 — 바로 사용 가능합니다
          </div>
          <p className="text-sm">
            "<b>{result.suggestedLabel}</b>" 슬라이드가 리포트에 즉시 추가되었습니다. 
            위 <b>Slide Composer</b> 목록에서 순서와 표시 여부를 조정할 수 있고, 
            <b>Export PPT</b> 시 자동으로 포함됩니다.
          </p>
          <div className="text-xs text-muted-foreground">
            수정·삭제는 Admin 권한이 필요합니다.
          </div>
          <div>
            <Button variant="outline" onClick={onStartOver}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> 다른 슬라이드 만들기
            </Button>
          </div>
        </div>
      )}

      {/* Advanced */}
      {result && (
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAdvanced && 'rotate-180')} />
              Advanced (spec JSON)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-3">
            <div className="text-xs text-muted-foreground">key: <code className="font-mono">{result.suggestedKey}</code></div>
            <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap">
{JSON.stringify(result.spec, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
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
