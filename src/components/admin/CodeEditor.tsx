import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Code2, Download, Loader2, RotateCcw, Save, Sparkles, Upload, Copy,
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

export default function CodeEditor() {
  const { toast } = useToast();
  const [active, setActive] = useState<CodeFileVersion | null>(null);
  const [activeContent, setActiveContent] = useState<string | null>(null);
  const [versions, setVersions] = useState<CodeFileVersion[]>([]);
  const [loading, setLoading] = useState(true);

  const [instruction, setInstruction] = useState('');
  const [modifying, setModifying] = useState(false);
  const [modifiedContent, setModifiedContent] = useState<string | null>(null);
  const [targetFunction, setTargetFunction] = useState<string | null>(null);
  const [targetRange, setTargetRange] = useState<{ startLine: number; endLine: number } | null>(null);
  const [identifyReason, setIdentifyReason] = useState<string>('');
  const [changeSummary, setChangeSummary] = useState<string>('');
  const [downloadedOnce, setDownloadedOnce] = useState(false);

  const [bootstrapFile, setBootstrapFile] = useState<File | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

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
      toast({ title: 'No active file', description: 'Upload an initial ppt-builder.ts first.', variant: 'destructive' });
      return;
    }
    if (!instruction.trim()) {
      toast({ title: 'Enter an instruction', variant: 'destructive' });
      return;
    }
    setModifying(true);
    setModifiedContent(null);
    setTargetFunction(null);
    setTargetRange(null);
    setIdentifyReason('');
    setChangeSummary('');
    setDownloadedOnce(false);
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
        title: 'Modified by Claude',
        description: `${result.targetFunction} (L${result.targetRange.startLine}–${result.targetRange.endLine})`,
      });
    } catch (e) {
      toast({ title: 'Modification failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setModifying(false);
    }
  };

  const handleDownload = () => {
    if (!modifiedContent) return;
    downloadText(modifiedContent, FILE_NAME);
    setDownloadedOnce(true);
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
      setModifiedContent(null);
      setChangeSummary('');
      setInstruction('');
      setDownloadedOnce(false);
      await refresh();
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
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

  const copyInstruction = async () => {
    await navigator.clipboard.writeText(PASTE_INSTRUCTION);
    toast({ title: 'Copied to clipboard' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Code2 className="h-4 w-4" /> Code Editor — {FILE_NAME}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current version */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">Current Version</h3>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : active ? (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">{FILE_NAME}</div>
                <div className="text-xs text-muted-foreground">
                  Uploaded {new Date(active.uploaded_at).toLocaleString()}
                </div>
                {active.change_summary_ko && (
                  <div className="mt-1 text-xs text-muted-foreground">{active.change_summary_ko}</div>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={handleDownloadActive}>
                <Download className="mr-1 h-3.5 w-3.5" /> Download current
              </Button>
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              No file uploaded yet. Use "Upload Initial File" below.
            </div>
          )}
        </section>

        {/* Bootstrap */}
        {!active && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Upload Initial File</h3>
            <div className="space-y-2 rounded-md border p-3">
              <Label className="text-xs">ppt-builder.ts</Label>
              <Input
                type="file"
                accept=".ts"
                onChange={(e) => setBootstrapFile(e.target.files?.[0] ?? null)}
                className="h-9"
              />
              <Button size="sm" onClick={handleBootstrap} disabled={!bootstrapFile || bootstrapping}>
                {bootstrapping ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
                Upload Initial File
              </Button>
              <p className="text-xs text-muted-foreground">
                Upload the current <code>src/lib/ppt-builder.ts</code> from your local PC to bootstrap the editor.
              </p>
            </div>
          </section>
        )}

        {/* Instruction */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">Describe the change you want</h3>
          <div className="space-y-3 rounded-md border p-3">
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="예: Defect Snapshot 슬라이드의 제목 폰트 크기를 24pt로 키워줘"
              className="min-h-[80px] text-sm"
              disabled={!active}
            />
            <Button
              size="sm"
              onClick={handleModify}
              disabled={!active || !instruction.trim() || modifying}
            >
              {modifying ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              Modify with Claude
            </Button>
            <p className="text-xs text-muted-foreground">
              Claude가 지시 내용을 분석해 수정 대상 함수를 자동으로 식별하고, 해당 함수만 수정한 뒤 전체 파일에 splice 합니다 (토큰 한도 회피).
            </p>
          </div>
        </section>

        {/* Result */}
        {modifiedContent && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Modification Result</h3>
            <div className="space-y-3 rounded-md border p-3">
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
                · {modifiedContent.length.toLocaleString()} chars total
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleDownload}>
                  <Download className="mr-1 h-3.5 w-3.5" /> Download Modified File
                </Button>
                <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                  Save to Storage
                </Button>
              </div>

              {downloadedOnce && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                  <div className="font-medium">✅ 파일이 다운로드됐습니다.</div>
                  <div>
                    <div className="font-medium mt-1">Lovable에 적용하는 방법:</div>
                    <ol className="ml-5 list-decimal space-y-0.5 mt-1">
                      <li>Lovable 채팅창을 여세요</li>
                      <li>다운로드된 파일을 수정 후 채팅창에 업로드하세요</li>
                      <li>아래 문구를 입력하고 전송하세요:</li>
                    </ol>
                  </div>
                  <div className="flex items-center gap-2 rounded border bg-background px-2 py-1.5">
                    <code className="flex-1 text-xs">{PASTE_INSTRUCTION}</code>
                    <Button size="sm" variant="ghost" onClick={copyInstruction}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Preview modified file (read-only)
                </summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded bg-muted p-2 text-xs">{modifiedContent}</pre>
              </details>
            </div>
          </section>
        )}

        {/* Version history */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">Version History</h3>
          <div className="overflow-x-auto rounded-md border">
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
        </section>
      </CardContent>
    </Card>
  );
}
