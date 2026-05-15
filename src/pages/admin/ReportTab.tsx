import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Copy, Download, Plus, Sparkles, X, FileText, Loader2 } from 'lucide-react';
import {
  buildReportMarkdown,
  type ReportModule,
  type ReportSection,
} from '@/lib/report-builder';

const MODULE_OPTIONS: { id: ReportModule; label: string }[] = [
  { id: 'tnc', label: 'T&C' },
  { id: 'defect', label: 'Defect' },
  { id: 'docs', label: 'Docs (ABD/OMM/Warranty/Spare Part)' },
  { id: 'punch', label: 'Punch' },
];

const SECTION_OPTIONS: { id: ReportSection; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard summary' },
  { id: 'progress', label: 'Progress summary' },
  { id: 'simulation', label: 'Simulation summary' },
  { id: 'snapshots', label: 'Stage Progress Snapshots' },
];

const MODELS = [
  'google/gemini-3-flash-preview',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'openai/gpt-5',
  'openai/gpt-5-mini',
  'openai/gpt-5.2',
];

const DEFAULT_SYSTEM_PROMPT =
  'You are a senior construction project status report writer. Convert the provided structured Markdown data into an executive-style status report in English. Use clear section headings, concise bullet points, highlight risks, gaps to plan, and required pace toward Mechanical Completion. Do not invent numbers — only use values present in the input.';

export default function ReportTab() {
  const { toast } = useToast();
  const [modules, setModules] = useState<ReportModule[]>(['tnc', 'defect', 'docs', 'punch']);
  const [sections, setSections] = useState<ReportSection[]>(['dashboard', 'progress', 'simulation', 'snapshots']);
  const [snapshotDates, setSnapshotDates] = useState<string[]>(['2026-05-30', '2026-06-07', '2026-06-14']);
  const [newDate, setNewDate] = useState('');
  const [mcDate, setMcDate] = useState('2026-06-15');
  const [delayMode, setDelayMode] = useState<'optimistic' | 'penalty'>('penalty');
  const [dataDateOverride, setDataDateOverride] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [generating, setGenerating] = useState(false);

  const [model, setModel] = useState(MODELS[0]);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [llmOutput, setLlmOutput] = useState('');
  const [llmRunning, setLlmRunning] = useState(false);

  const toggle = <T extends string>(arr: T[], v: T, set: (next: T[]) => void) => {
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  };

  const addDate = () => {
    if (!newDate) return;
    if (snapshotDates.includes(newDate)) return;
    setSnapshotDates([...snapshotDates, newDate].sort());
    setNewDate('');
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const md = await buildReportMarkdown({
        modules, sections, snapshotDates, mcDate,
        delayMode,
        dataDate: dataDateOverride || undefined,
      });
      setMarkdown(md);
      toast({ title: 'Markdown generated', description: `${md.length.toLocaleString()} characters` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Generation failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copied to clipboard` });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const download = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const runLlm = async () => {
    if (!markdown.trim()) {
      toast({ title: 'Generate Markdown first', variant: 'destructive' });
      return;
    }
    setLlmRunning(true);
    setLlmOutput('');
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report-llm`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ markdown, model, systemPrompt }),
      });
      if (!resp.ok || !resp.body) {
        if (resp.status === 429) toast({ title: 'Rate limit exceeded', variant: 'destructive' });
        else if (resp.status === 402) toast({ title: 'AI credits exhausted', description: 'Add credits in workspace settings', variant: 'destructive' });
        else toast({ title: 'LLM call failed', variant: 'destructive' });
        setLlmRunning(false);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n')) !== -1) {
          let line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line || line.startsWith(':')) continue;
          if (!line.startsWith('data: ')) continue;
          const j = line.slice(6).trim();
          if (j === '[DONE]') { done = true; break; }
          try {
            const p = JSON.parse(j);
            const c = p.choices?.[0]?.delta?.content;
            if (c) { acc += c; setLlmOutput(acc); }
          } catch {
            buf = line + '\n' + buf;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'LLM call failed', description: e instanceof Error ? e.message : 'Unknown', variant: 'destructive' });
    } finally {
      setLlmRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Report Generator</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          {/* Modules */}
          <div>
            <Label className="text-sm font-semibold">Modules</Label>
            <div className="mt-2 flex flex-wrap gap-4">
              {MODULE_OPTIONS.map(m => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={modules.includes(m.id)} onCheckedChange={() => toggle(modules, m.id, setModules)} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div>
            <Label className="text-sm font-semibold">Sections (per module)</Label>
            <div className="mt-2 flex flex-wrap gap-4">
              {SECTION_OPTIONS.map(s => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={sections.includes(s.id)} onCheckedChange={() => toggle(sections, s.id, setSections)} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          {/* Snapshot dates */}
          <div>
            <Label className="text-sm font-semibold">Snapshot Dates</Label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {snapshotDates.map(d => (
                <Badge key={d} variant="secondary" className="gap-1">
                  {d}
                  <button onClick={() => setSnapshotDates(snapshotDates.filter(x => x !== d))} aria-label={`remove ${d}`}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="h-8 w-40" />
              <Button size="sm" variant="outline" onClick={addDate}><Plus className="h-3 w-3 mr-1" />Add</Button>
            </div>
          </div>

          {/* MC date */}
          <div className="flex items-center gap-3">
            <Label className="text-sm font-semibold">Mechanical Completion D-Day</Label>
            <Input type="date" value={mcDate} onChange={e => setMcDate(e.target.value)} className="h-8 w-44" />
          </div>

          {/* Generate */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerate} disabled={generating || modules.length === 0}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Generate Markdown
            </Button>
            <Button variant="outline" disabled={!markdown} onClick={() => copy(markdown, 'Markdown')}>
              <Copy className="h-4 w-4 mr-1" /> Copy
            </Button>
            <Button variant="outline" disabled={!markdown} onClick={() => download(markdown, `shaw-status-${new Date().toISOString().slice(0, 10)}.md`)}>
              <Download className="h-4 w-4 mr-1" /> Download .md
            </Button>
          </div>

          <Textarea value={markdown} onChange={e => setMarkdown(e.target.value)} placeholder="Click Generate Markdown to populate…" className="min-h-[300px] font-mono text-xs" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> External LLM Report</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Label className="text-sm font-semibold">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-72 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODELS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm font-semibold">System Prompt</Label>
            <Textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} className="mt-1 min-h-[100px] text-xs" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runLlm} disabled={llmRunning || !markdown}>
              {llmRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate Report via LLM
            </Button>
            <Button variant="outline" disabled={!llmOutput} onClick={() => copy(llmOutput, 'Report')}>
              <Copy className="h-4 w-4 mr-1" /> Copy Report
            </Button>
            <Button variant="outline" disabled={!llmOutput} onClick={() => download(llmOutput, `shaw-report-${new Date().toISOString().slice(0, 10)}.md`)}>
              <Download className="h-4 w-4 mr-1" /> Download Report .md
            </Button>
          </div>
          <Textarea value={llmOutput} readOnly placeholder="LLM output will stream here…" className="min-h-[300px] font-mono text-xs" />
        </CardContent>
      </Card>
    </div>
  );
}
