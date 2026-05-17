import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, Download, Sparkles, Copy, RotateCcw, CheckCircle2, Wand2 } from 'lucide-react';
import { FinalConfirmDialog } from '@/components/admin/FinalConfirmDialog';
import { supabase } from '@/integrations/supabase/client';
import {
  getActiveVersion,
  listVersions,
  downloadYaml,
  uploadNewYaml,
  analyzeYaml,
  applyTokenChanges,
  saveVersion,
  setActiveVersion,
  rollbackToVersion,
  type DesignGuideVersion,
  type AnalysisResult,
} from '@/lib/design-guide-manager';
import { invokeCodeEditor } from '@/lib/code-editor';

interface Props {
  embedded?: boolean;
}

export default function DesignGuideManager({ embedded }: Props) {
  const { toast } = useToast();
  const [active, setActive] = useState<DesignGuideVersion | null>(null);
  const [versions, setVersions] = useState<DesignGuideVersion[]>([]);
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [versionLabel, setVersionLabel] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const [rollbackTarget, setRollbackTarget] = useState<DesignGuideVersion | null>(null);
  const [rolling, setRolling] = useState(false);

  // Natural-language YAML modification
  const [nlInstruction, setNlInstruction] = useState('');
  const [nlModifying, setNlModifying] = useState(false);
  const [nlModified, setNlModified] = useState<string | null>(null);
  const [nlOriginal, setNlOriginal] = useState<string | null>(null);
  const [nlSummary, setNlSummary] = useState<string>('');
  const [nlApplying, setNlApplying] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [a, v] = await Promise.all([getActiveVersion(), listVersions()]);
    setActive(a);
    setVersions(v);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleDownloadActive = async () => {
    if (!active) return;
    try {
      const yaml = await downloadYaml(active.storage_path);
      const blob = new Blob([yaml], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = active.storage_path.split('/').pop() ?? 'design-guide.yaml';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: 'Download failed', description: String(e), variant: 'destructive' });
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      toast({ title: 'Select a YAML file first', variant: 'destructive' });
      return;
    }
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const newYaml = await file.text();
      const oldYaml = active ? await downloadYaml(active.storage_path) : '';
      const path = await uploadNewYaml(file);
      setUploadedPath(path);
      const result = await analyzeYaml(oldYaml, newYaml);
      setAnalysis(result);
      toast({ title: 'Analysis complete' });
    } catch (e) {
      toast({
        title: 'Analysis failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApply = async () => {
    if (!analysis || !uploadedPath) return;
    setApplying(true);
    try {
      await applyTokenChanges(analysis.colorTokens, analysis.fontTokens);
      const saved = await saveVersion({
        storage_path: uploadedPath,
        version_label: versionLabel || undefined,
        summary_ko: analysis.summaryKo,
      });
      await setActiveVersion(saved.id);
      toast({ title: 'Tokens applied & version saved' });
      setFile(null);
      setVersionLabel('');
      setAnalysis(null);
      setUploadedPath(null);
      await refresh();
    } catch (e) {
      toast({
        title: 'Apply failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const handleRollback = async () => {
    if (!rollbackTarget) return;
    setRolling(true);
    try {
      await rollbackToVersion(rollbackTarget.id);
      toast({ title: 'Rolled back', description: rollbackTarget.version_label ?? 'version' });
      setRollbackTarget(null);
      await refresh();
    } catch (e) {
      toast({
        title: 'Rollback failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setRolling(false);
    }
  };

  const copySuggestion = async () => {
    if (!analysis?.codeSuggestion) return;
    await navigator.clipboard.writeText(analysis.codeSuggestion);
    toast({ title: 'Code suggestion copied' });
  };

  const handleNlModify = async () => {
    if (!active) {
      toast({ title: 'No active design guide', variant: 'destructive' });
      return;
    }
    if (!nlInstruction.trim()) {
      toast({ title: 'Enter an instruction', variant: 'destructive' });
      return;
    }
    setNlModifying(true);
    setNlModified(null);
    setNlSummary('');
    try {
      const yaml = await downloadYaml(active.storage_path);
      setNlOriginal(yaml);
      const result = await invokeCodeEditor({
        fileContent: yaml,
        instruction: nlInstruction.trim(),
        fileType: 'yaml',
      });
      setNlModified(result.modifiedContent);
      setNlSummary(result.changeSummary);
      toast({ title: 'Modified with Claude' });
    } catch (e) {
      toast({ title: 'Modification failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setNlModifying(false);
    }
  };

  const downloadModifiedYaml = () => {
    if (!nlModified) return;
    const blob = new Blob([nlModified], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `design-guide-modified-${new Date().toISOString().slice(0, 10)}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleApplyNlTokens = async () => {
    if (!nlModified || !nlOriginal) return;
    setNlApplying(true);
    try {
      const filename = `nl-modified-${new Date().toISOString().replace(/[:.]/g, '-')}.yaml`;
      const blob = new Blob([nlModified], { type: 'text/yaml' });
      const file = new File([blob], filename, { type: 'text/yaml' });
      const { data: userData } = await supabase.auth.getUser();
      void userData; // not used directly here; uploadNewYaml uses storage upload

      const path = await (await import('@/lib/design-guide-manager')).uploadNewYaml(file);
      const analysisResult = await analyzeYaml(nlOriginal, nlModified);
      await applyTokenChanges(analysisResult.colorTokens, analysisResult.fontTokens);
      const saved = await saveVersion({
        storage_path: path,
        version_label: `NL: ${nlInstruction.trim().slice(0, 60)}`,
        summary_ko: nlSummary || analysisResult.summaryKo,
      });
      await setActiveVersion(saved.id);
      toast({ title: 'Tokens applied & version saved' });
      setNlInstruction('');
      setNlModified(null);
      setNlOriginal(null);
      setNlSummary('');
      await refresh();
    } catch (e) {
      toast({ title: 'Apply failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setNlApplying(false);
    }
  };

  const renderYamlDiff = (oldText: string, newText: string) => {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);
    const out: { type: 'add' | 'del' | 'same'; text: string }[] = [];
    // Simple line-level set diff for quick visual feedback
    newLines.forEach((l) => {
      if (!oldSet.has(l)) out.push({ type: 'add', text: l });
      else out.push({ type: 'same', text: l });
    });
    oldLines.forEach((l) => {
      if (!newSet.has(l)) out.push({ type: 'del', text: l });
    });
    return out;
  };

  const hex = (v: string) => (v.startsWith('#') ? v : `#${v}`);

  const body = (
    <div className="space-y-6">
      {/* Current Version */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Current Version</h3>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : active ? (
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">{active.version_label ?? '(no label)'}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(active.uploaded_at).toLocaleString()}
              </div>
              {active.summary_ko && (
                <div className="mt-1 text-xs text-muted-foreground">{active.summary_ko}</div>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={handleDownloadActive}>
              <Download className="mr-1 h-3.5 w-3.5" /> Download YAML
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No active design guide. Upload one below.
          </div>
        )}
      </section>

      {/* Upload */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Upload New Version</h3>
        <div className="space-y-2 rounded-md border p-3">
          <div>
            <Label className="text-xs">YAML file</Label>
            <Input
              type="file"
              accept=".yaml,.yml"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">Version label (optional)</Label>
            <Input
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="e.g. v4.1 — amber accent update"
              className="h-9"
            />
          </div>
          <Button size="sm" onClick={handleAnalyze} disabled={!file || analyzing}>
            {analyzing ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            Analyze with Claude
          </Button>
        </div>
      </section>

      {/* Analysis Results */}
      {analysis && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Analysis Results</h3>
          <div className="space-y-3 rounded-md border p-3">
            {/* Summary */}
            <div className="rounded bg-muted/40 p-2 text-sm">{analysis.summaryKo}</div>

            {/* Immediately applicable */}
            <div>
              <div className="mb-1 text-xs font-semibold text-foreground">
                Immediately applicable
              </div>
              {Object.keys(analysis.colorTokens).length === 0 && !analysis.fontTokens?.body && !analysis.fontTokens?.mono ? (
                <div className="text-xs text-muted-foreground">No token changes.</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(analysis.colorTokens).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className="font-mono">{key}</span>
                      <span
                        className="inline-block h-4 w-8 rounded border"
                        style={{ background: hex(value) }}
                      />
                      <span className="font-mono">#{value}</span>
                    </div>
                  ))}
                  {analysis.fontTokens?.body && (
                    <div className="text-xs">
                      <span className="font-mono">ppt.font.body</span> → {analysis.fontTokens.body}
                    </div>
                  )}
                  {analysis.fontTokens?.mono && (
                    <div className="text-xs">
                      <span className="font-mono">ppt.font.mono</span> → {analysis.fontTokens.mono}
                    </div>
                  )}
                  <Button size="sm" onClick={handleApply} disabled={applying}>
                    {applying ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    )}
                    Apply Now
                  </Button>
                </div>
              )}
            </div>

            {/* Structural changes */}
            {analysis.structuralChanges.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold text-foreground">Requires code edit</div>
                <ul className="ml-4 list-disc space-y-0.5 text-xs">
                  {analysis.structuralChanges.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
                {analysis.codeSuggestion && (
                  <div className="mt-2 space-y-1">
                    <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
                      {analysis.codeSuggestion}
                    </pre>
                    <Button size="sm" variant="outline" onClick={copySuggestion}>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      Paste into ppt-builder.ts in the Lovable editor.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Version History */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Version History</h3>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-2 py-1.5 text-left">Label</th>
                <th className="px-2 py-1.5 text-left">Uploaded</th>
                <th className="px-2 py-1.5 text-left">Summary</th>
                <th className="px-2 py-1.5 text-left">Status</th>
                <th className="px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {versions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">
                    No versions yet.
                  </td>
                </tr>
              ) : (
                versions.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="px-2 py-1.5">{v.version_label ?? '—'}</td>
                    <td className="px-2 py-1.5">{new Date(v.uploaded_at).toLocaleDateString()}</td>
                    <td className="px-2 py-1.5 max-w-md truncate" title={v.summary_ko ?? ''}>
                      {v.summary_ko ?? '—'}
                    </td>
                    <td className="px-2 py-1.5">
                      {v.is_active && <Badge variant="secondary">Active</Badge>}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRollbackTarget(v)}
                        disabled={v.is_active}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Rollback
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <FinalConfirmDialog
        open={!!rollbackTarget}
        onOpenChange={(o) => !o && setRollbackTarget(null)}
        title="Rollback to this version?"
        description={`Tokens snapshot from "${rollbackTarget?.version_label ?? 'this version'}" will overwrite current design tokens. This will affect all future PPT exports.`}
        confirmLabel="Rollback"
        confirmVariant="warning"
        busy={rolling}
        onConfirm={handleRollback}
      />
    </div>
  );

  if (embedded) {
    return (
      <div className="rounded-md border p-4">
        <div className="mb-3 flex items-center gap-2">
          <Upload className="h-4 w-4" />
          <h2 className="text-sm font-semibold">Design Guide Manager</h2>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Design Guide Manager</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
