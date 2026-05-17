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
  const [modifiedFunctionSource, setModifiedFunctionSource] = useState<string | null>(null);
  const [changeSummary, setChangeSummary] = useState<string>('');
  const [downloadedOnce, setDownloadedOnce] = useState(false);

  const [functions, setFunctions] = useState<FunctionRange[]>([]);
  const [selectedFnName, setSelectedFnName] = useState<string>('');

  const [bootstrapFile, setBootstrapFile] = useState<File | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

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
      const fns = a?.content ? parseTopLevelFunctions(a.content) : [];
      setFunctions(fns);
      setSelectedFnName((prev) => (fns.some((f) => f.name === prev) ? prev : ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const selectedRange = functions.find((f) => f.name === selectedFnName) ?? null;

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
    if (!selectedRange) {
      toast({ title: 'Select a function to modify', variant: 'destructive' });
      return;
    }
    if (!instruction.trim()) {
      toast({ title: 'Enter an instruction', variant: 'destructive' });
      return;
    }
    setModifying(true);
    setModifiedContent(null);
    setModifiedFunctionSource(null);
    setChangeSummary('');
    setDownloadedOnce(false);
    try {
      const result = await invokeCodeEditorFunction({
        functionSource: selectedRange.source,
        functionName: selectedRange.name,
        instruction: instruction.trim(),
      });
      const splicedFull = spliceFunction(activeContent, selectedRange, result.modifiedContent);
      setModifiedFunctionSource(result.modifiedContent);
      setModifiedContent(splicedFull);
      setChangeSummary(result.changeSummary);
      toast({
        title: 'Modified by Claude',
        description: `${selectedRange.name}: ${selectedRange.source.length.toLocaleString()} → ${result.modifiedContent.length.toLocaleString()} chars`,
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

        {/* Function selector + Instruction */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">Describe the change you want</h3>
          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-1">
              <Label className="text-xs">Target function</Label>
              <Select
                value={selectedFnName}
                onValueChange={setSelectedFnName}
                disabled={!active || functions.length === 0}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={functions.length === 0 ? 'No functions parsed' : 'Select a function to modify'} />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {functions.map((f) => (
                    <SelectItem key={f.name} value={f.name}>
                      <span className="font-mono text-xs">{f.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        (lines {f.startLine}–{f.endLine}, {f.source.length.toLocaleString()} chars)
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRange && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Preview selected function (read-only)
                  </summary>
                  <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{selectedRange.source}</pre>
                </details>
              )}
            </div>

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
              disabled={!active || !selectedRange || !instruction.trim() || modifying}
            >
              {modifying ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
              Modify Selected Function with Claude
            </Button>
            <p className="text-xs text-muted-foreground">
              전체 파일이 아닌 선택한 함수만 Claude에 전송하고, 응답을 원본 파일에 splice 합니다 (토큰 한도 회피).
            </p>
          </div>
        </section>

        {/* Result */}
        {modifiedContent && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Modification Result</h3>
            <div className="space-y-3 rounded-md border p-3">
              <div className="rounded bg-muted/40 p-2 text-sm whitespace-pre-wrap">{changeSummary || '(no summary)'}</div>
              <div className="text-xs text-muted-foreground">
                {selectedRange && modifiedFunctionSource && (
                  <>
                    Function <span className="font-mono">{selectedRange.name}</span>:{' '}
                    {selectedRange.source.split('\n').length} → {modifiedFunctionSource.split('\n').length} lines
                    <span className="mx-2">·</span>
                  </>
                )}
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
