import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  Loader2,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  type CodeFileVersion,
  downloadActiveCodeFile,
  downloadCodeVersion,
  invokeCodeEditorAuto,
  listCodeVersions,
  restoreCodeVersion,
  saveCodeVersion,
} from '@/lib/code-editor';
// Vite ?raw — 빌드 시점의 src/lib/ppt-builder.ts 원문이 문자열로 번들됨
import pptBuilderSource from '@/lib/ppt-builder.ts?raw';
import { cn } from '@/lib/utils';

const FILE_NAME = 'ppt-builder.ts';
const PASTE_INSTRUCTION = 'ppt-builder.ts를 업로드한 파일로 교체해주세요';

function downloadText(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

type Step3State = 'idle' | 'save' | 'download' | 'apply' | 'done';

function StepHeader({
  num,
  title,
  state,
}: {
  num: number;
  title: string;
  state: 'pending' | 'active' | 'done';
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold border',
          state === 'done' && 'bg-primary text-primary-foreground border-primary',
          state === 'active' && 'bg-primary/10 text-primary border-primary',
          state === 'pending' && 'bg-muted text-muted-foreground border-border',
        )}
      >
        {state === 'done' ? <Check className="h-3.5 w-3.5" /> : num}
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
  );
}

export default function CodeEditor() {
  const { toast } = useToast();
  const [active, setActive] = useState<CodeFileVersion | null>(null);
  const [activeContent, setActiveContent] = useState<string | null>(null);
  const [versions, setVersions] = useState<CodeFileVersion[]>([]);
  const [loading, setLoading] = useState(true);

  const [instruction, setInstruction] = useState('');
  const [modifying, setModifying] = useState(false);
  const [modifiedContent, setModifiedContent] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [targetFunction, setTargetFunction] = useState<string | null>(null);
  const [targetRange, setTargetRange] = useState<{ startLine: number; endLine: number } | null>(null);
  const [identifyReason, setIdentifyReason] = useState<string>('');
  const [changeSummary, setChangeSummary] = useState<string>('');

  const [step3, setStep3] = useState<Step3State>('idle');

  const [bootstrapFile, setBootstrapFile] = useState<File | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [a, v] = await Promise.all([
        downloadActiveCodeFile(FILE_NAME).catch(() => null),
        listCodeVersions(FILE_NAME).catch(() => [] as CodeFileVersion[]),
      ]);
      setActive(a?.version ?? null);
      setActiveContent(a?.content ?? null);
      setVersions(v);
      // active 파일 없으면 Advanced 자동 펼침
      if (!a?.version) setAdvancedOpen(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const resetFlow = () => {
    setModifiedContent(null);
    setAccepted(false);
    setTargetFunction(null);
    setTargetRange(null);
    setIdentifyReason('');
    setChangeSummary('');
    setStep3('idle');
    setInstruction('');
  };

  const handleBootstrap = async () => {
    if (!bootstrapFile) {
      toast({ title: 'Select ppt-builder.ts file first', variant: 'destructive' });
      return;
    }
    if (!bootstrapFile.name.endsWith('.ts')) {
      toast({ title: 'File must be a .ts file', variant: 'destructive' });
      return;
    }
    setBootstrapping(true);
    try {
      const content = await bootstrapFile.text();
      await saveCodeVersion({
        fileName: FILE_NAME,
        content,
        changeSummaryKo: '초기 버전 업로드',
        instruction: 'Initial bootstrap',
      });
      toast({ title: 'Initial file uploaded' });
      setBootstrapFile(null);
      await refresh();
    } catch (e) {
      toast({ title: 'Upload failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBootstrapping(false);
    }
  };

  const handleModify = async () => {
    if (!active || !activeContent) {
      toast({ title: 'No active file', description: 'Use Advanced → Sync from codebase first.', variant: 'destructive' });
      setAdvancedOpen(true);
      return;
    }
    if (!instruction.trim()) {
      toast({ title: 'Enter an instruction', variant: 'destructive' });
      return;
    }
    setModifying(true);
    setModifiedContent(null);
    setAccepted(false);
    setStep3('idle');
    try {
      const result = await invokeCodeEditorAuto({
        fileName: FILE_NAME,
        instruction: instruction.trim(),
      });
      setModifiedContent(result.modifiedContent);
      setTargetFunction(result.targetFunction);
      setTargetRange(result.targetRange);
      setIdentifyReason(result.identifyReason ?? '');
      setChangeSummary(result.changeSummary);
      toast({
        title: 'Edit ready for review',
        description: `${result.targetFunction} (L${result.targetRange.startLine}–${result.targetRange.endLine})`,
      });
    } catch (e) {
      toast({ title: 'Modification failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setModifying(false);
    }
  };

  const handleAccept = () => {
    setAccepted(true);
    setStep3('save');
  };

  const handleDiscard = () => {
    setModifiedContent(null);
    setAccepted(false);
    setStep3('idle');
  };

  const handleSave = async () => {
    if (!modifiedContent) return;
    setSaving(true);
    try {
      await saveCodeVersion({
        fileName: FILE_NAME,
        content: modifiedContent,
        changeSummaryKo: changeSummary,
        instruction: instruction.trim(),
      });
      toast({ title: 'Saved to Storage' });
      setStep3('download');
      await refresh();
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    if (!modifiedContent) return;
    downloadText(modifiedContent, FILE_NAME);
    setStep3('apply');
  };

  const handleApplyDone = () => {
    setStep3('done');
    toast({ title: '🎉 Done', description: 'Lovable 채팅창에서 교체 요청을 보내면 적용이 끝납니다.' });
  };

  const handleRestore = async (v: CodeFileVersion) => {
    if (!confirm(`Restore version from ${new Date(v.uploaded_at).toLocaleString()}?`)) return;
    setRestoring(v.id);
    try {
      await restoreCodeVersion(v.id);
      toast({ title: 'Restored' });
      await refresh();
    } catch (e) {
      toast({ title: 'Restore failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setRestoring(null);
    }
  };

  const handleDownloadActive = async () => {
    if (!active) return;
    try {
      const content = await downloadCodeVersion(active.storage_path);
      downloadText(content, FILE_NAME);
    } catch (e) {
      toast({ title: 'Download failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const handleSyncFromCodebase = async () => {
    const lineCount = pptBuilderSource.split('\n').length;
    if (!confirm(`Codebase의 ${FILE_NAME} (${lineCount} lines)을 Storage에 새 active 버전으로 저장합니다. 진행할까요?`)) return;
    setSyncing(true);
    try {
      await saveCodeVersion({
        fileName: FILE_NAME,
        content: pptBuilderSource,
        changeSummaryKo: 'Codebase에서 동기화 (Sync from codebase)',
        instruction: 'Sync from src/lib/ppt-builder.ts via UI button',
      });
      toast({ title: 'Synced from codebase', description: `${lineCount} lines uploaded as new active version` });
      await refresh();
    } catch (e) {
      toast({ title: 'Sync failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const copyInstruction = async () => {
    await navigator.clipboard.writeText(PASTE_INSTRUCTION);
    toast({ title: 'Copied to clipboard' });
  };

  const step1State: 'pending' | 'active' | 'done' = !active ? 'pending' : modifiedContent ? 'done' : 'active';
  const step2State: 'pending' | 'active' | 'done' = !modifiedContent ? 'pending' : accepted ? 'done' : 'active';
  const step3State: 'pending' | 'active' | 'done' = !accepted ? 'pending' : step3 === 'done' ? 'done' : 'active';

  const step1Disabled = !active;
  const step2Disabled = !modifiedContent;
  const step3Disabled = !accepted;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Code2 className="h-4 w-4" /> Code Editor — {FILE_NAME}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Status bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            {loading ? (
              <span className="text-muted-foreground">Loading…</span>
            ) : active ? (
              <>
                <Badge variant="secondary">Active</Badge>
                <span className="font-medium">{FILE_NAME}</span>
                <span className="text-muted-foreground">
                  · {new Date(active.uploaded_at).toLocaleString()}
                </span>
                {activeContent && (
                  <span className="text-muted-foreground">
                    · {activeContent.split('\n').length.toLocaleString()} lines
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">
                No active file. Open <strong>Advanced</strong> below to initialize.
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {active && (
              <Button size="sm" variant="ghost" onClick={handleDownloadActive}>
                <Download className="mr-1 h-3.5 w-3.5" /> Download current
              </Button>
            )}
          </div>
        </div>

        {/* Step 1 */}
        <section className={cn('rounded-md border p-4', step1Disabled && 'opacity-60')}>
          <StepHeader num={1} title="Describe your change" state={step1State} />
          <div className="space-y-3">
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="예: Defect Snapshot 슬라이드의 제목 폰트 크기를 24pt로 키워줘"
              className="min-h-[90px] text-sm"
              disabled={step1Disabled || modifying}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Claude가 지시 내용을 분석해 수정 대상 함수를 자동으로 식별·수정합니다.
              </p>
              <Button
                size="sm"
                onClick={handleModify}
                disabled={step1Disabled || !instruction.trim() || modifying}
              >
                {modifying ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                Generate edit with Claude
              </Button>
            </div>
          </div>
        </section>

        {/* Step 2 */}
        <section className={cn('rounded-md border p-4', step2Disabled && 'opacity-60')}>
          <StepHeader num={2} title="Review the proposed edit" state={step2State} />
          {!modifiedContent ? (
            <p className="text-xs text-muted-foreground">Step 1을 먼저 실행하면 여기에 결과가 표시됩니다.</p>
          ) : (
            <div className="space-y-3">
              {targetFunction && targetRange && (
                <div className="rounded border bg-muted/30 p-2 text-xs">
                  <div>
                    Target: <span className="font-mono font-semibold">{targetFunction}</span>{' '}
                    <span className="text-muted-foreground">(L{targetRange.startLine}–{targetRange.endLine})</span>
                  </div>
                  {identifyReason && (
                    <div className="mt-0.5 text-muted-foreground">Why: {identifyReason}</div>
                  )}
                </div>
              )}
              <div className="rounded bg-muted/40 p-2 text-sm whitespace-pre-wrap">{changeSummary || '(no summary)'}</div>
              <div className="text-xs text-muted-foreground">
                {activeContent ? `File: ${activeContent.split('\n').length} → ${modifiedContent.split('\n').length} lines` : ''}
                {' · '}{modifiedContent.length.toLocaleString()} chars total
              </div>
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Preview modified file (read-only)
                </summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded bg-muted p-2 text-xs">{modifiedContent}</pre>
              </details>
              {!accepted && (
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={handleDiscard}>
                    <X className="mr-1 h-3.5 w-3.5" /> Discard
                  </Button>
                  <Button size="sm" onClick={handleAccept}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Looks good — Continue
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Step 3 */}
        <section className={cn('rounded-md border p-4', step3Disabled && 'opacity-60')}>
          <StepHeader num={3} title="Apply to your app" state={step3State} />
          {step3Disabled ? (
            <p className="text-xs text-muted-foreground">Step 2에서 "Looks good"을 누르면 적용 단계가 활성화됩니다.</p>
          ) : (
            <ol className="space-y-3">
              {/* 3-1 Save */}
              <li className="flex items-start gap-3">
                <div
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                    (step3 === 'download' || step3 === 'apply' || step3 === 'done')
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border',
                  )}
                >
                  {(step3 === 'download' || step3 === 'apply' || step3 === 'done') ? <Check className="h-3 w-3" /> : '1'}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Save as new active version</div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Storage에 새 버전으로 저장하고 이전 버전은 자동으로 비활성화됩니다.
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={step3 !== 'save' || saving}
                    variant={step3 === 'save' ? 'default' : 'outline'}
                  >
                    {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                    Save to Storage
                  </Button>
                </div>
              </li>

              {/* 3-2 Download */}
              <li className="flex items-start gap-3">
                <div
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                    (step3 === 'apply' || step3 === 'done')
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border',
                  )}
                >
                  {(step3 === 'apply' || step3 === 'done') ? <Check className="h-3 w-3" /> : '2'}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Download updated file</div>
                  <div className="text-xs text-muted-foreground mb-2">
                    수정된 <code>{FILE_NAME}</code>을 로컬로 다운로드합니다.
                  </div>
                  <Button
                    size="sm"
                    onClick={handleDownload}
                    disabled={step3 !== 'download'}
                    variant={step3 === 'download' ? 'default' : 'outline'}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    Download {FILE_NAME}
                  </Button>
                </div>
              </li>

              {/* 3-3 Apply via Lovable chat */}
              <li className="flex items-start gap-3">
                <div
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                    step3 === 'done'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border',
                  )}
                >
                  {step3 === 'done' ? <Check className="h-3 w-3" /> : '3'}
                </div>
                <div className={cn('flex-1', step3 !== 'apply' && step3 !== 'done' && 'opacity-60')}>
                  <div className="text-sm font-medium">Apply via Lovable chat</div>
                  <ol className="ml-4 mt-1 list-decimal space-y-0.5 text-xs text-muted-foreground">
                    <li>Lovable 채팅창을 여세요</li>
                    <li>방금 다운로드한 파일을 채팅창에 업로드하세요</li>
                    <li>아래 문구를 복사해 전송하세요</li>
                  </ol>
                  <div className="mt-2 flex items-center gap-2 rounded border bg-background px-2 py-1.5">
                    <code className="flex-1 text-xs">{PASTE_INSTRUCTION}</code>
                    <Button size="sm" variant="ghost" onClick={copyInstruction} disabled={step3 !== 'apply' && step3 !== 'done'}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {step3 === 'apply' && (
                    <Button size="sm" className="mt-2" onClick={handleApplyDone}>
                      <Check className="mr-1 h-3.5 w-3.5" /> Mark as applied
                    </Button>
                  )}
                  {step3 === 'done' && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={resetFlow}>
                      Start a new edit
                    </Button>
                  )}
                </div>
              </li>
            </ol>
          )}
        </section>

        {/* Advanced */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Settings2 className="h-3.5 w-3.5" /> Advanced
              </span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
            {/* Sync from codebase */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-semibold">Sync from codebase</div>
              <p className="text-xs text-muted-foreground">
                현재 빌드의 <code>src/lib/ppt-builder.ts</code> ({pptBuilderSource.split('\n').length} lines)을 Storage에 새 active 버전으로 푸시합니다. Storage가 잘리거나 codebase와 어긋났을 때 복구용으로 사용하세요.
              </p>
              <Button size="sm" variant="default" onClick={handleSyncFromCodebase} disabled={syncing}>
                {syncing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
                Sync from codebase
              </Button>
            </div>

            {/* Bootstrap — active 없을 때만 */}
            {!active && (
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-semibold">Upload initial file</div>
                <Label className="text-xs">ppt-builder.ts</Label>
                <Input
                  type="file"
                  accept=".ts"
                  onChange={(e) => setBootstrapFile(e.target.files?.[0] ?? null)}
                  className="h-9"
                />
                <Button size="sm" onClick={handleBootstrap} disabled={!bootstrapFile || bootstrapping}>
                  {bootstrapping ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
                  Upload initial file
                </Button>
                <p className="text-xs text-muted-foreground">
                  로컬 PC의 <code>src/lib/ppt-builder.ts</code>를 업로드해 Storage를 초기화합니다.
                </p>
              </div>
            )}

            {/* Version history */}
            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-sm font-semibold">Version history</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Date</th>
                      <th className="px-2 py-1.5 text-left">Change Summary</th>
                      <th className="px-2 py-1.5 text-left">Status</th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">
                          No versions yet.
                        </td>
                      </tr>
                    ) : (
                      versions.map((v) => (
                        <tr key={v.id} className="border-t">
                          <td className="px-2 py-1.5 whitespace-nowrap">{new Date(v.uploaded_at).toLocaleString()}</td>
                          <td className="px-2 py-1.5 max-w-md">{v.change_summary_ko ?? '—'}</td>
                          <td className="px-2 py-1.5">
                            {v.is_active && <Badge variant="secondary">Active</Badge>}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRestore(v)}
                              disabled={v.is_active || restoring === v.id}
                            >
                              {restoring === v.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                              )}
                              Restore
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
