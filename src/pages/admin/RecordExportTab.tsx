import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  exportRecordWorkbook,
  fetchDistinctSubcontractors,
  fetchDistinctSubsubs,
  fetchSystems,
  type RecordModule,
  type TncMilestone,
  type OutputKind,
} from '@/lib/record-export';

function toISO(d: Date | undefined): string {
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface MultiSelectProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

function MultiSelect({ label, options, selected, onChange, disabled, placeholder }: MultiSelectProps) {
  const allSelected = options.length > 0 && selected.length === options.length;
  const text = disabled
    ? (placeholder ?? 'n/a')
    : selected.length === 0
      ? `All (${options.length})`
      : selected.length === options.length
        ? `All (${options.length})`
        : `${selected.length} selected`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{text}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex items-center justify-between border-b p-2 text-xs">
          <span className="font-medium text-muted-foreground">{label}</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => onChange(options.map(o => o.value))}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:underline"
              onClick={() => onChange([])}
            >
              Clear
            </button>
          </div>
        </div>
        <ScrollArea className="h-64">
          <div className="p-2">
            {options.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">No options</div>
            ) : (
              options.map(o => {
                const checked = allSelected ? true : selected.includes(o.value);
                return (
                  <label
                    key={o.value}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={v => {
                        if (v) onChange(Array.from(new Set([...selected, o.value])));
                        else onChange(selected.filter(s => s !== o.value));
                      }}
                    />
                    <span className="truncate">{o.label}</span>
                  </label>
                );
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default function RecordExportTab() {
  const { toast } = useToast();
  const [projectId, setProjectId] = useState<string | null>(null);

  const [module, setModule] = useState<RecordModule>('tnc');
  const [tncMilestone, setTncMilestone] = useState<TncMilestone>('t2');

  const [subOptions, setSubOptions] = useState<string[]>([]);
  const [subsubOptions, setSubsubOptions] = useState<string[]>([]);
  const [systemOptions, setSystemOptions] = useState<{ id: string; code: string }[]>([]);

  const [subcontractors, setSubcontractors] = useState<string[]>([]);
  const [subsubs, setSubsubs] = useState<string[]>([]);
  const [systemIds, setSystemIds] = useState<string[]>([]);

  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const [outputs, setOutputs] = useState<OutputKind[]>(['planned', 'actual']);
  const [includeSubtotals, setIncludeSubtotals] = useState(true);
  const [includeSCurve, setIncludeSCurve] = useState(true);

  const [loadingMeta, setLoadingMeta] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load project
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('projects')
        .select('id')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1);
      setProjectId(data?.[0]?.id ?? null);
    })();
  }, []);

  // Load distinct subcontractors + systems when module/project changes
  useEffect(() => {
    if (!projectId) return;
    setLoadingMeta(true);
    setSubcontractors([]);
    setSubsubs([]);
    setSystemIds([]);
    (async () => {
      try {
        const [subs, systems] = await Promise.all([
          fetchDistinctSubcontractors(module, projectId),
          module === 'tnc' ? fetchSystems(projectId) : Promise.resolve([]),
        ]);
        setSubOptions(subs);
        setSubsubOptions([]);
        setSystemOptions(systems);
      } catch (e) {
        toast({
          title: 'Failed to load options',
          description: e instanceof Error ? e.message : String(e),
          variant: 'destructive',
        });
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, [projectId, module, toast]);

  // Reload sub-sub options when subcontractor selection changes
  useEffect(() => {
    if (!projectId) return;
    if (subcontractors.length === 0) {
      setSubsubOptions([]);
      setSubsubs([]);
      return;
    }
    (async () => {
      try {
        const list = await fetchDistinctSubsubs(module, projectId, subcontractors);
        setSubsubOptions(list);
        setSubsubs(prev => prev.filter(v => list.includes(v)));
      } catch (e) {
        console.error(e);
      }
    })();
  }, [projectId, module, subcontractors]);

  const toggleOutput = (k: OutputKind, on: boolean) => {
    setOutputs(prev => {
      const next = on ? Array.from(new Set([...prev, k])) : prev.filter(x => x !== k);
      return next;
    });
  };

  const canExport = useMemo(() => {
    return !!projectId && !!startDate && !!endDate && outputs.length > 0;
  }, [projectId, startDate, endDate, outputs]);

  const handleExport = async () => {
    if (!projectId || !startDate || !endDate) return;
    setExporting(true);
    try {
      await exportRecordWorkbook({
        module,
        projectId,
        subcontractors,
        subsubs,
        systemIds: module === 'tnc' ? systemIds : [],
        startDate: toISO(startDate),
        endDate: toISO(endDate),
        outputs,
        tncMilestone,
        includeSubtotals,
        includeSCurve,
      });
      toast({ title: 'Export complete' });
    } catch (e) {
      toast({
        title: 'Export failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const subSelectOptions = subOptions.map(s => ({ value: s, label: s }));
  const subsubSelectOptions = subsubOptions.map(s => ({ value: s, label: s }));
  const systemSelectOptions = systemOptions.map(s => ({ value: s.id, label: s.code }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Record Export</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Module */}
            <div className="space-y-2">
              <Label>Module</Label>
              <div className="flex gap-2">
                <Select value={module} onValueChange={v => setModule(v as RecordModule)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tnc">T&amp;C</SelectItem>
                    <SelectItem value="defect">Defect</SelectItem>
                  </SelectContent>
                </Select>
                {module === 'tnc' && (
                  <Select value={tncMilestone} onValueChange={v => setTncMilestone(v as TncMilestone)}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="t1">T1</SelectItem>
                      <SelectItem value="t2">T2</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Subcontractor */}
            <div className="space-y-2">
              <Label>Subcontractor</Label>
              <MultiSelect
                label="Subcontractor"
                options={subSelectOptions}
                selected={subcontractors}
                onChange={setSubcontractors}
              />
            </div>

            {/* Sub-Sub */}
            <div className="space-y-2">
              <Label>Sub-Sub</Label>
              <MultiSelect
                label="Sub-Sub"
                options={subsubSelectOptions}
                selected={subsubs}
                onChange={setSubsubs}
                disabled={subcontractors.length === 0}
                placeholder="Pick subcontractors first"
              />
            </div>

            {/* System */}
            <div className="space-y-2">
              <Label>System</Label>
              <MultiSelect
                label="System"
                options={systemSelectOptions}
                selected={systemIds}
                onChange={setSystemIds}
                disabled={module !== 'tnc'}
                placeholder="T&C only"
              />
            </div>

            {/* Start date */}
            <div className="space-y-2">
              <Label>Start date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn('w-full justify-start font-normal', !startDate && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End date */}
            <div className="space-y-2">
              <Label>End date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn('w-full justify-start font-normal', !endDate && 'text-muted-foreground')}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Outputs */}
            <div className="space-y-2 md:col-span-2">
              <Label>Outputs</Label>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={outputs.includes('planned')}
                    onCheckedChange={v => toggleOutput('planned', !!v)}
                  />
                  Planned
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={outputs.includes('actual')}
                    onCheckedChange={v => toggleOutput('actual', !!v)}
                  />
                  Actual
                </label>
                <span className="text-xs text-muted-foreground">
                  (Selecting both adds Variance = Actual − Planned)
                </span>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-2">
              <Label>Options</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeSubtotals}
                    onCheckedChange={v => setIncludeSubtotals(!!v)}
                  />
                  Include subcontractor subtotals
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeSCurve}
                    onCheckedChange={v => setIncludeSCurve(!!v)}
                  />
                  Include S-Curve sheet (A4 landscape)
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button onClick={handleExport} disabled={!canExport || exporting || loadingMeta}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Generate Excel
            </Button>
            {loadingMeta && <span className="text-xs text-muted-foreground">Loading options…</span>}
            {!projectId && <span className="text-xs text-destructive">No active project</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
