import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  fetchSlideDisplayOptions, saveSlideDisplayOptions, resetSlideDisplayOptions,
  defaultOptionsForSlide, getSlideKind, type SlideOptions,
} from '@/lib/slide-display-options';

interface Props {
  slideKey: string;
  slideLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
}

export default function SlideDisplayOptionsDialog({
  slideKey, slideLabel, open, onOpenChange, canEdit,
}: Props) {
  const { toast } = useToast();
  const [opts, setOpts] = useState<SlideOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const kind = getSlideKind(slideKey);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const o = await fetchSlideDisplayOptions(slideKey);
        if (!cancelled) setOpts(o);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, slideKey]);

  const update = <K extends string>(k: K, v: unknown) => {
    setOpts((o) => o ? ({ ...o, [k]: v }) as SlideOptions : o);
  };

  const onSave = async () => {
    if (!opts) return;
    setSaving(true);
    try {
      await saveSlideDisplayOptions(slideKey, opts as Record<string, unknown>);
      toast({ title: 'Display options saved', description: slideLabel });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    if (!confirm(`Reset "${slideLabel}" display options to default?`)) return;
    setSaving(true);
    try {
      await resetSlideDisplayOptions(slideKey);
      setOpts(defaultOptionsForSlide(slideKey));
      toast({ title: 'Reset to default' });
    } catch (e) {
      toast({
        title: 'Reset failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const o = opts as Record<string, unknown> | null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Display Options</DialogTitle>
          <DialogDescription>
            {slideLabel} · {kind}
          </DialogDescription>
        </DialogHeader>

        {loading || !o ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            {/* Common */}
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="opt-show-footer" className="text-sm">Show Footer</Label>
              <Switch
                id="opt-show-footer"
                checked={!!o.show_footer}
                onCheckedChange={(v) => update('show_footer', v)}
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Headline Font Size Offset</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {(o.headline_font_size_offset as number) >= 0 ? '+' : ''}
                  {o.headline_font_size_offset as number}
                </span>
              </div>
              <Slider
                min={-4} max={4} step={1}
                value={[o.headline_font_size_offset as number]}
                onValueChange={(v) => update('headline_font_size_offset', v[0])}
                disabled={!canEdit}
              />
            </div>

            {/* Snapshot */}
            {kind === 'snapshot' && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">Show Stage Progress</Label>
                  <Switch
                    checked={!!o.show_stage_progress}
                    onCheckedChange={(v) => update('show_stage_progress', v)}
                    disabled={!canEdit}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">Show KPI Strip</Label>
                  <Switch
                    checked={!!o.show_kpi_strip}
                    onCheckedChange={(v) => update('show_kpi_strip', v)}
                    disabled={!canEdit}
                  />
                </div>
              </>
            )}

            {/* S-Curve */}
            {kind === 'scurve' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">Chart Type</Label>
                  <Select
                    value={String(o.chart_type ?? 'line')}
                    onValueChange={(v) => update('chart_type', v)}
                    disabled={!canEdit}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="line">Line</SelectItem>
                      <SelectItem value="area">Area</SelectItem>
                      <SelectItem value="bar">Bar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">Show Forecast Line</Label>
                  <Switch
                    checked={!!o.show_forecast}
                    onCheckedChange={(v) => update('show_forecast', v)}
                    disabled={!canEdit}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">Y-Axis Zero-Based</Label>
                  <Switch
                    checked={!!o.y_axis_zero_based}
                    onCheckedChange={(v) => update('y_axis_zero_based', v)}
                    disabled={!canEdit}
                  />
                </div>
              </>
            )}

            {/* Forecast */}
            {kind === 'forecast' && (
              <div className="space-y-1.5">
                <Label className="text-sm">Bar Orientation</Label>
                <Select
                  value={String(o.bar_orientation ?? 'horizontal')}
                  onValueChange={(v) => update('bar_orientation', v)}
                  disabled={!canEdit}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="horizontal">Horizontal</SelectItem>
                    <SelectItem value="vertical">Vertical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Action Plan */}
            {kind === 'action_plan' && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">Show Left Panel</Label>
                  <Switch
                    checked={!!o.show_left_panel}
                    onCheckedChange={(v) => update('show_left_panel', v)}
                    disabled={!canEdit}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">Show Right Panel</Label>
                  <Switch
                    checked={!!o.show_right_panel}
                    onCheckedChange={(v) => update('show_right_panel', v)}
                    disabled={!canEdit}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Max Items per Panel</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {o.max_items_per_panel as number}
                    </span>
                  </div>
                  <Slider
                    min={3} max={10} step={1}
                    value={[o.max_items_per_panel as number]}
                    onValueChange={(v) => update('max_items_per_panel', v[0])}
                    disabled={!canEdit}
                  />
                </div>
              </>
            )}

            <p className="text-[11px] text-muted-foreground border-t pt-3">
              Common options (footer, headline offset) apply on the next PPT export.
              Some advanced options are stored but applied incrementally as builders adopt them.
            </p>
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            type="button" variant="ghost" onClick={onReset}
            disabled={!canEdit || saving || loading}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={onSave} disabled={!canEdit || saving || loading}>
              {saving
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
