import { useEffect, useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { GripVertical, Loader2, RotateCcw, Save, Layers, Trash2, Settings2 } from 'lucide-react';
import { DEFAULT_SLIDE_ORDER, loadSlideRegistry, type SlideCategory, type SlideMeta } from '@/lib/slide-registry';
import { fetchSlideConfig, saveSlideConfig, invalidateSlideConfigCache } from '@/lib/slide-config';
import type { SlideConfigItem } from '@/lib/ppt-builder';
import { deleteCustomSlide, invalidateCustomSlidesCache } from '@/lib/custom-slides-cache';
import SlideTextEditor from '@/components/admin/SlideTextEditor';
import SlideCodegen from '@/components/admin/SlideCodegen';
import SlideDisplayOptionsDialog from '@/components/admin/SlideDisplayOptionsDialog';

interface Props {
  embedded?: boolean;
}

const CATEGORY_LABEL: Record<SlideCategory, string> = {
  intro: 'Intro', overview: 'Overview', tnc: 'T&C', defect: 'Defect',
  docs: 'Docs', punch: 'Punch', custom: 'Custom',
};

function defaultItems(): SlideConfigItem[] {
  return DEFAULT_SLIDE_ORDER.map((k) => ({ key: k, enabled: true }));
}

function SortableRow({
  item, index, isAdmin, registry, onToggle, onDelete,
}: {
  item: SlideConfigItem; index: number; isAdmin: boolean;
  registry: Record<string, SlideMeta>;
  onToggle: (k: string, enabled: boolean) => void;
  onDelete: (meta: SlideMeta) => void;
}) {
  const meta = registry[item.key];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key, disabled: !isAdmin });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  if (!meta) return null;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-md border bg-card p-3"
    >
      <button
        type="button"
        className="flex h-8 w-6 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
        disabled={!isAdmin}
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="w-6 text-xs text-muted-foreground tabular-nums">{String(index + 1).padStart(2, '0')}</div>
      <Checkbox
        checked={item.enabled}
        onCheckedChange={(v) => onToggle(item.key, !!v)}
        disabled={!isAdmin}
        aria-label={`Enable ${meta.label}`}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate flex items-center gap-1.5">
          {meta.label}
          {meta.isCustom && <Badge variant="secondary" className="h-4 px-1 text-[10px]">Custom</Badge>}
        </div>
        <div className="text-xs text-muted-foreground truncate">{meta.description}</div>
      </div>
      <Badge variant="outline" className="shrink-0">{CATEGORY_LABEL[meta.category]}</Badge>
      {meta.isCustom && isAdmin && (
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(meta)}
          aria-label={`Delete ${meta.label}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export default function SlideComposer({ embedded = false }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<SlideConfigItem[]>([]);
  const [registry, setRegistry] = useState<Record<string, SlideMeta>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reload = async () => {
    setLoading(true);
    invalidateCustomSlidesCache();
    invalidateSlideConfigCache();
    const [reg, cfg, auth] = await Promise.all([
      loadSlideRegistry(),
      fetchSlideConfig(true),
      supabase.auth.getUser(),
    ]);
    let admin = false;
    const uid = auth.data.user?.id;
    if (uid) {
      const { data } = await supabase.rpc('has_role', { _user_id: uid, _role: 'admin' });
      admin = !!data;
    }
    setRegistry(reg);
    setItems(cfg);
    setIsAdmin(admin);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await reload(); })();
    return () => { cancelled = true; };
  }, []);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((curr) => {
      const oldIdx = curr.findIndex((i) => i.key === active.id);
      const newIdx = curr.findIndex((i) => i.key === over.id);
      if (oldIdx < 0 || newIdx < 0) return curr;
      return arrayMove(curr, oldIdx, newIdx);
    });
    setDirty(true);
  };

  const onToggle = (k: string, enabled: boolean) => {
    setItems((curr) => curr.map((i) => (i.key === k ? { ...i, enabled } : i)));
    setDirty(true);
  };

  const onReset = () => {
    setItems(defaultItems());
    setDirty(true);
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await saveSlideConfig(items);
      setDirty(false);
      toast({ title: 'Slide configuration saved' });
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : 'Unknown', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const onDeleteCustom = async (meta: SlideMeta) => {
    if (!meta.customId) return;
    if (!confirm(`Delete custom slide "${meta.label}"? This cannot be undone.`)) return;
    try {
      await deleteCustomSlide(meta.customId);
      // Remove from config too
      const next = items.filter((i) => i.key !== meta.key);
      await saveSlideConfig(next);
      toast({ title: `Deleted "${meta.label}"` });
      await reload();
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Unknown', variant: 'destructive' });
    }
  };

  const enabledCount = items.filter((i) => i.enabled).length;

  const body = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {enabledCount} of {items.length} slides enabled · drag to reorder
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onReset} disabled={!isAdmin || saving}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
          </Button>
          <Button size="sm" onClick={onSave} disabled={!isAdmin || saving || !dirty}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save
          </Button>
        </div>
      </div>

      {!isAdmin && !loading && (
        <div className="rounded-md border border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">
          Admins only — view-only mode.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <SortableRow
                  key={item.key}
                  item={item}
                  index={idx}
                  isAdmin={isAdmin}
                  registry={registry}
                  onToggle={onToggle}
                  onDelete={onDeleteCustom}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="rounded-md border bg-background p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-semibold">Slide Composer</div>
        </div>
        {body}
        <SlideTextEditor embedded />
        <SlideCodegen embedded onAdded={reload} />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" /> Slide Composer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {body}
        <SlideTextEditor embedded />
        <SlideCodegen embedded onAdded={reload} />
      </CardContent>
    </Card>
  );
}
