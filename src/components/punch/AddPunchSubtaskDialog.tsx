import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ALL_TEAMS, type TeamType } from '@/types/enums';
import {
  SUBTASK_STAGES,
  SUBTASK_STAGE_LABEL,
  type SubtaskStage,
} from '@/lib/punch-field-registry';

interface ExistingSubtask {
  subtask_stage: SubtaskStage | null;
  planned_completion_date: string | null;
  planned_start_date?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string;
  parentItemNo: string | null;
  parentTeam: TeamType | null;
  parentIsSummary: boolean;
  parentPlannedStartDate?: string | null;
  /** Identity/classification defaults only — outstanding_work, dates, remarks are derived from stage logic. */
  defaults?: {
    location?: string | null;
    main_trade?: string | null;
    sub_trade?: string | null;
    work_type?: string | null;
    team?: TeamType | null;
    subcontractor_name?: string | null;
    subsub_name?: string | null;
    hdec_pic_name?: string | null;
    hdec_eng_name?: string | null;
  };
  /** Existing siblings, used to auto-pick the next stage and chain start date. */
  existingSubtasks?: ExistingSubtask[];
  onCreated?: (newId: string) => void;
}

const STAGE_PREFIX: Record<SubtaskStage, string> = {
  pre_engineering: '[Pre-Engineering] ',
  physical_work: '[Physical Work] ',
  inspection: '[Inspection] ',
};

/** Pick first stage in canonical order not yet present; if all present, fall back to physical_work. */
function pickNextStage(existing: ExistingSubtask[]): SubtaskStage {
  const present = new Set(existing.map((e) => e.subtask_stage).filter(Boolean) as SubtaskStage[]);
  for (const s of SUBTASK_STAGES) if (!present.has(s)) return s;
  return 'physical_work';
}

/** Latest planned_completion_date across siblings whose stage is BEFORE the target stage. */
function computeChainedStart(
  targetStage: SubtaskStage,
  existing: ExistingSubtask[],
  parentPlannedStart: string | null | undefined,
): string {
  const targetIdx = SUBTASK_STAGES.indexOf(targetStage);
  const earlier = existing.filter((e) => {
    if (!e.subtask_stage) return false;
    const idx = SUBTASK_STAGES.indexOf(e.subtask_stage);
    return idx >= 0 && idx < targetIdx;
  });
  const completions = earlier
    .map((e) => e.planned_completion_date)
    .filter((d): d is string => !!d)
    .sort();
  if (completions.length > 0) return completions[completions.length - 1];
  return parentPlannedStart ?? '';
}

export function AddPunchSubtaskDialog({
  open, onOpenChange, parentId, parentItemNo, parentTeam, parentIsSummary,
  parentPlannedStartDate, defaults, existingSubtasks, onCreated,
}: Props) {
  const { toast } = useToast();

  const siblings = useMemo(() => existingSubtasks ?? [], [existingSubtasks]);
  const initialStage = useMemo(() => pickNextStage(siblings), [siblings]);

  const [stage, setStage] = useState<SubtaskStage>(initialStage);
  const [outstanding, setOutstanding] = useState(STAGE_PREFIX[initialStage]);
  const [location, setLocation] = useState(defaults?.location ?? '');
  const [workType, setWorkType] = useState(defaults?.work_type ?? '');
  const [mainTrade, setMainTrade] = useState(defaults?.main_trade ?? '');
  const [subTrade, setSubTrade] = useState(defaults?.sub_trade ?? '');
  const [team, setTeam] = useState<TeamType | ''>(defaults?.team ?? parentTeam ?? '');
  const [subcontractor, setSubcontractor] = useState(defaults?.subcontractor_name ?? '');
  const [subsub, setSubsub] = useState(defaults?.subsub_name ?? '');
  const [hdecPic, setHdecPic] = useState(defaults?.hdec_pic_name ?? '');
  const [hdecEng, setHdecEng] = useState(defaults?.hdec_eng_name ?? '');
  const [plannedStart, setPlannedStart] = useState(
    computeChainedStart(initialStage, siblings, parentPlannedStartDate),
  );
  const [plannedEnd, setPlannedEnd] = useState('');
  const [weight, setWeight] = useState('1');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  // dirty flags so user edits survive a stage change
  const [outstandingDirty, setOutstandingDirty] = useState(false);
  const [startDirty, setStartDirty] = useState(false);

  // Re-prefill when dialog opens.
  useEffect(() => {
    if (!open) return;
    const ns = pickNextStage(siblings);
    setStage(ns);
    setOutstanding(STAGE_PREFIX[ns]);
    setOutstandingDirty(false);
    setLocation(defaults?.location ?? '');
    setWorkType(defaults?.work_type ?? '');
    setMainTrade(defaults?.main_trade ?? '');
    setSubTrade(defaults?.sub_trade ?? '');
    setTeam((defaults?.team ?? parentTeam ?? '') as TeamType | '');
    setSubcontractor(defaults?.subcontractor_name ?? '');
    setSubsub(defaults?.subsub_name ?? '');
    setHdecPic(defaults?.hdec_pic_name ?? '');
    setHdecEng(defaults?.hdec_eng_name ?? '');
    setPlannedStart(computeChainedStart(ns, siblings, parentPlannedStartDate));
    setStartDirty(false);
    setPlannedEnd('');
    setWeight('1');
    setRemarks('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When user changes stage in-dialog, recompute prefix + chained start if untouched.
  function handleStageChange(next: SubtaskStage) {
    setStage(next);
    if (!outstandingDirty) {
      setOutstanding(STAGE_PREFIX[next]);
    } else {
      // If body started with the OLD prefix, swap prefix while keeping the body text.
      const oldPrefix = STAGE_PREFIX[stage];
      if (outstanding.startsWith(oldPrefix)) {
        setOutstanding(STAGE_PREFIX[next] + outstanding.slice(oldPrefix.length));
      }
    }
    if (!startDirty) {
      setPlannedStart(computeChainedStart(next, siblings, parentPlannedStartDate));
    }
  }

  function handleOutstandingChange(v: string) {
    setOutstanding(v);
    // mark dirty only when user types beyond the auto-prefix
    if (v !== STAGE_PREFIX[stage]) setOutstandingDirty(true);
  }

  function handleStartChange(v: string) {
    setPlannedStart(v);
    setStartDirty(true);
  }

  async function handleSubmit() {
    // Strip prefix-only entries — require real content
    const trimmed = outstanding.trim();
    const prefixTrimmed = STAGE_PREFIX[stage].trim();
    if (!trimmed || trimmed === prefixTrimmed) {
      toast({ title: 'Outstanding Works is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      outstanding_work: outstanding,
      location: location || null,
      work_type: workType || null,
      main_trade: mainTrade || null,
      sub_trade: subTrade || null,
      subcontractor_name: subcontractor || null,
      subsub_name: subsub || null,
      hdec_pic_name: hdecPic || null,
      hdec_eng_name: hdecEng || null,
      planned_start_date: plannedStart || null,
      planned_completion_date: plannedEnd || null,
      weight: weight || '1',
      remarks: remarks || null,
      ...(team ? { team } : {}),
    };
    const { data, error } = await (supabase as any).rpc('add_punch_subtask', {
      p_parent_id: parentId,
      p_stage: stage,
      p_payload: payload,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Failed to add subtask', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: parentIsSummary ? 'Subtask added' : 'Promoted to Summary + subtask added',
      description: parentIsSummary
        ? `Added to ${parentItemNo ?? 'parent'}.`
        : `${parentItemNo ?? 'Parent'} is now a Summary. Original row preserved as first subtask.`,
    });
    onOpenChange(false);
    if (data) onCreated?.(data as string);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Add Subtask {parentItemNo && <Badge variant="outline" className="ml-2">{parentItemNo}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {parentIsSummary
              ? 'Add a new subtask under this Summary item.'
              : 'This will convert the parent into a Summary item. The original row is kept as the first Physical Work subtask.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium">Stage *</Label>
            <RadioGroup value={stage} onValueChange={(v) => handleStageChange(v as SubtaskStage)} className="mt-1 grid grid-cols-3 gap-2">
              {SUBTASK_STAGES.map((s) => (
                <label
                  key={s}
                  htmlFor={`stage-${s}`}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <RadioGroupItem value={s} id={`stage-${s}`} />
                  <span>{SUBTASK_STAGE_LABEL[s]}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label className="text-xs">Outstanding Works *</Label>
            <Textarea value={outstanding} onChange={(e) => handleOutstandingChange(e.target.value)} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">Work Type</Label><Input value={workType} onChange={(e) => setWorkType(e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">Main Trade</Label><Input value={mainTrade} onChange={(e) => setMainTrade(e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">Sub Trade</Label><Input value={subTrade} onChange={(e) => setSubTrade(e.target.value)} className="h-9" /></div>
            <div>
              <Label className="text-xs">Team <span className="text-muted-foreground">(can differ from parent)</span></Label>
              <Select value={team || undefined} onValueChange={(v) => setTeam(v as TeamType)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {ALL_TEAMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                Planned Start
                {!startDirty && plannedStart && (
                  <span className="text-muted-foreground ml-1">(auto)</span>
                )}
              </Label>
              <Input type="date" value={plannedStart} onChange={(e) => handleStartChange(e.target.value)} className="h-9" />
            </div>
            <div><Label className="text-xs">Planned Completion</Label><Input type="date" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">Weight</Label><Input type="number" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} className="h-9" /></div>
          </div>

          <div>
            <Label className="text-xs">Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !outstanding.trim()}>
            {saving ? 'Adding…' : 'Add Subtask'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
