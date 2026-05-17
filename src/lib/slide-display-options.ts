// Per-slide display options.
// Stored in `slide_display_options` table as JSONB per slide_key.
// Editable by senior_user+, readable by all authenticated users.

import { supabase } from '@/integrations/supabase/client';
import { z } from 'zod';

// ─────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────

/** Options that apply to every slide. */
export const CommonOptionsSchema = z.object({
  show_footer: z.boolean().default(true),
  headline_font_size_offset: z.number().int().min(-4).max(4).default(0),
}).default({ show_footer: true, headline_font_size_offset: 0 });

export type CommonOptions = z.infer<typeof CommonOptionsSchema>;

/** Snapshot-style slides (tnc_snapshot, defect_snapshot, docs_snapshot, punch_snapshot). */
export const SnapshotOptionsSchema = CommonOptionsSchema.removeDefault().extend({
  show_stage_progress: z.boolean().default(true),
  show_kpi_strip: z.boolean().default(true),
}).default({
  show_footer: true,
  headline_font_size_offset: 0,
  show_stage_progress: true,
  show_kpi_strip: true,
});

export type SnapshotOptions = z.infer<typeof SnapshotOptionsSchema>;

/** S-Curve slides. */
export const ScurveOptionsSchema = CommonOptionsSchema.removeDefault().extend({
  chart_type: z.enum(['line', 'area', 'bar']).default('line'),
  show_forecast: z.boolean().default(true),
  y_axis_zero_based: z.boolean().default(true),
}).default({
  show_footer: true,
  headline_font_size_offset: 0,
  chart_type: 'line',
  show_forecast: true,
  y_axis_zero_based: true,
});

export type ScurveOptions = z.infer<typeof ScurveOptionsSchema>;

/** Forecast slides. */
export const ForecastOptionsSchema = CommonOptionsSchema.removeDefault().extend({
  bar_orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
}).default({
  show_footer: true,
  headline_font_size_offset: 0,
  bar_orientation: 'horizontal',
});

export type ForecastOptions = z.infer<typeof ForecastOptionsSchema>;

/** Action Plan slides. */
export const ActionPlanOptionsSchema = CommonOptionsSchema.removeDefault().extend({
  show_left_panel: z.boolean().default(true),
  show_right_panel: z.boolean().default(true),
  max_items_per_panel: z.number().int().min(3).max(10).default(6),
}).default({
  show_footer: true,
  headline_font_size_offset: 0,
  show_left_panel: true,
  show_right_panel: true,
  max_items_per_panel: 6,
});

export type ActionPlanOptions = z.infer<typeof ActionPlanOptionsSchema>;

// ─────────────────────────────────────────
// Slide → schema mapping
// ─────────────────────────────────────────
export type SlideKind = 'common' | 'snapshot' | 'scurve' | 'forecast' | 'action_plan';

export const SLIDE_KIND_BY_KEY: Record<string, SlideKind> = {
  cover: 'common',
  dashboard: 'common',
  tnc_snapshot: 'snapshot',
  tnc_scurve: 'scurve',
  tnc_forecast: 'forecast',
  tnc_action_plan: 'action_plan',
  defect_snapshot: 'snapshot',
  defect_scurve: 'scurve',
  defect_forecast: 'forecast',
  defect_action_plan: 'action_plan',
  docs_snapshot: 'snapshot',
  punch_snapshot: 'snapshot',
};

export function getSlideKind(slideKey: string): SlideKind {
  return SLIDE_KIND_BY_KEY[slideKey] ?? 'common';
}

export function schemaForSlide(slideKey: string) {
  const kind = getSlideKind(slideKey);
  switch (kind) {
    case 'snapshot':    return SnapshotOptionsSchema;
    case 'scurve':      return ScurveOptionsSchema;
    case 'forecast':    return ForecastOptionsSchema;
    case 'action_plan': return ActionPlanOptionsSchema;
    case 'common':
    default:            return CommonOptionsSchema;
  }
}

export type SlideOptions =
  | CommonOptions | SnapshotOptions | ScurveOptions | ForecastOptions | ActionPlanOptions;

export function defaultOptionsForSlide(slideKey: string): SlideOptions {
  // schema.default() unwraps via parse({})
  return schemaForSlide(slideKey).parse(undefined) as SlideOptions;
}

// ─────────────────────────────────────────
// Cache + IO
// ─────────────────────────────────────────
const TTL_MS = 5 * 60 * 1000;
type OptionsMap = Record<string, Record<string, unknown>>;
let cache: { at: number; data: OptionsMap } | null = null;

export function invalidateSlideDisplayOptionsCache() {
  cache = null;
}

export async function fetchAllSlideDisplayOptions(force = false): Promise<OptionsMap> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const { data, error } = await supabase
      .from('slide_display_options')
      .select('slide_key, options');
    if (error) throw error;
    const map: OptionsMap = {};
    for (const row of data ?? []) {
      const r = row as { slide_key: string; options: Record<string, unknown> };
      map[r.slide_key] = r.options ?? {};
    }
    cache = { at: Date.now(), data: map };
    return map;
  } catch {
    return {};
  }
}

export async function fetchSlideDisplayOptions(slideKey: string): Promise<SlideOptions> {
  const all = await fetchAllSlideDisplayOptions();
  const raw = all[slideKey];
  const schema = schemaForSlide(slideKey);
  try {
    return schema.parse(raw ?? undefined) as SlideOptions;
  } catch {
    return defaultOptionsForSlide(slideKey);
  }
}

export async function saveSlideDisplayOptions(
  slideKey: string,
  options: Record<string, unknown>,
): Promise<void> {
  // Validate / coerce against schema before saving
  const schema = schemaForSlide(slideKey);
  const parsed = schema.parse(options);

  const auth = await supabase.auth.getUser();
  const uid = auth.data.user?.id ?? null;
  const { error } = await supabase
    .from('slide_display_options')
    .upsert(
      [{ slide_key: slideKey, options: parsed as unknown as never, updated_by: uid ?? undefined }],
      { onConflict: 'slide_key' },
    );
  if (error) throw error;
  invalidateSlideDisplayOptionsCache();
}

export async function resetSlideDisplayOptions(slideKey: string): Promise<void> {
  const { error } = await supabase
    .from('slide_display_options')
    .delete()
    .eq('slide_key', slideKey);
  if (error) throw error;
  invalidateSlideDisplayOptionsCache();
}
