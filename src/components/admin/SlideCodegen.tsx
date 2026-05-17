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
  Check, ChevronDown, Copy, Loader2, RotateCcw, Sparkles, UploadCloud, Wand2,
} from 'lucide-react';
import { SLIDE_REGISTRY, DEFAULT_SLIDE_ORDER } from '@/lib/slide-registry';
import {
  addSlideToReport,
  generateSlideCode,
  type SlideCodegenResult,
  type SlideDataSource,
} from '@/lib/slide-codegen';
import { cn } from '@/lib/utils';

interface Props {
  embedded?: boolean;
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

  const lovableInstruction = result
    ? `Storage의 ppt-builder.ts를 src/lib/ppt-builder.ts로 동기화하고, src/lib/slide-registry.ts의 SLIDE_REGISTRY에 다음 항목을 추가해 주세요:\n  ${result.suggestedKey}: { key: '${result.suggestedKey}', label: '${result.suggestedLabel.replace(/'/g, "\\'")}', number: ${position + 1}, description: '${title.replace(/'/g, "\\'")}', category: '${selectedSources[0] ?? 'tnc'}' }\n그리고 src/lib/ppt-builder.ts의 SlideKey 타입과 DEFAULT_SLIDE_ORDER에도 '${result.suggestedKey}' 키를 추가해 주세요.`
    : '';

  const onAddToReport = async () => {
    if (!result) return;
    setAdding(true);
    try {
      await addSlideToReport({
        functionCode: result.functionCode,
        suggestedKey: result.suggestedKey,
        suggestedLabel: result.suggestedLabel,
        title: title.trim(),
      });
      setStage('added');
      toast({ title: '슬라이드가 Storage에 추가되었습니다' });
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

  const onCopyInstruction = async () => {
    try {
      await navigator.clipboard.writeText(lovableInstruction);
      toast({ title: '안내문을 클립보드에 복사했습니다' });
    } catch (e) {
      toast({ title: '복사 실패', description: e instanceof Error ? e.message : 'Unknown', variant: 'destructive' });
    }
  };

  const onCopyCode = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.functionCode);
      toast({ title: '코드를 복사했습니다' });
    } catch (e) {
      toast({ title: '복사 실패', description: e instanceof Error ? e.message : 'Unknown', variant: 'destructive' });
    }
  };

  const onStartOver = () => {
    setResult(null);
    setStage('describe');
  };

  const body = (
    <div className="space-y-4">
      {!isAdmin && (
        <div className="rounded-md border border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">
          Admins only — view-only mode.
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

      {/* STEP 1 — Describe */}
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
                disabled={!isAdmin || generating}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">어느 슬라이드 뒤에 넣을까요?</Label>
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
            <Label className="text-xs">어떤 데이터를 사용할까요?</Label>
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
            <Label htmlFor="codegen-desc" className="text-xs">자연어로 설명해 주세요</Label>
            <Textarea
              id="codegen-desc"
              rows={4}
              placeholder='예: "T&C와 Defect 진행률을 좌우 카드로 비교, 현재 % 와 목표 pace 표시"'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!isAdmin || generating}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={onGenerate} disabled={!canGenerate}>
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

          <div className="text-xs text-muted-foreground">
            코드 {result.functionCode.split('\n').length}줄 생성됨 · 자세한 코드는 아래 Advanced에서 확인 가능합니다.
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onStartOver} disabled={adding}>
              마음에 안 들어요
            </Button>
            <Button onClick={onAddToReport} disabled={!isAdmin || adding}>
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
            <Check className="h-4 w-4" /> 3. 추가 완료 — 마지막 한 단계만 남았습니다
          </div>

          <p className="text-sm">
            슬라이드 함수가 Storage에 안전하게 저장되었습니다. 실제로 Report에 나타나려면 아래 안내문을 <b>Lovable 채팅창</b>에 붙여넣어 주세요.
          </p>

          <div className="rounded-md border bg-background p-3">
            <pre className="text-xs whitespace-pre-wrap font-mono">{lovableInstruction}</pre>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onCopyInstruction}>
              <Copy className="h-3.5 w-3.5 mr-1.5" /> 안내문 복사
            </Button>
            <Button variant="outline" onClick={onStartOver}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> 다른 슬라이드 만들기
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Lovable이 코드를 적용한 뒤 Slide Composer에서 새 슬라이드의 순서·표시 여부를 조정할 수 있습니다.
          </div>
        </div>
      )}

      {/* Advanced */}
      {result && (
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAdvanced && 'rotate-180')} />
              Advanced (개발자용)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">생성된 함수 코드</div>
              <Button size="sm" variant="outline" onClick={onCopyCode}>
                <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
              </Button>
            </div>
            <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap">
{result.functionCode}
            </pre>
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">key: </span>
                <code className="font-mono">{result.suggestedKey}</code>
              </div>
              <div>
                <span className="text-muted-foreground">label: </span>
                <span>{result.suggestedLabel}</span>
              </div>
            </div>
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
