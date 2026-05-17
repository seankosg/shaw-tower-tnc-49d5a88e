// Slide metadata for the PPT composer UI.
// The actual builder functions live in `ppt-builder.ts`; this file only
// describes each slide for selection / reordering purposes.

import type { SlideKey, BuiltInSlideKey } from '@/lib/ppt-builder';
import { DEFAULT_SLIDE_ORDER } from '@/lib/ppt-builder';
import { fetchCustomSlides } from '@/lib/custom-slides-cache';

export type SlideCategory = 'intro' | 'overview' | 'tnc' | 'defect' | 'docs' | 'punch' | 'custom';

export interface SlideMeta {
  key: SlideKey;
  number: number;
  label: string;
  description: string;
  category: SlideCategory;
  isCustom?: boolean;
  customId?: string;
}

export const SLIDE_REGISTRY: Record<BuiltInSlideKey, SlideMeta> = {
  cover:              { key: 'cover',              number: 1,  label: 'Cover',                       description: 'Title slide with project & D-day',                category: 'intro' },
  dashboard:          { key: 'dashboard',          number: 2,  label: 'All-Module Dashboard',        description: 'Snapshot of all four workstreams',               category: 'overview' },
  tnc_snapshot:       { key: 'tnc_snapshot',       number: 3,  label: 'T&C Snapshot',                description: 'Pre-Test / Official / Test Report KPIs',         category: 'tnc' },
  tnc_scurve:         { key: 'tnc_scurve',         number: 4,  label: 'T&C Plan vs Actual',          description: 'S-curve plan vs actual progression',             category: 'tnc' },
  tnc_forecast:       { key: 'tnc_forecast',       number: 5,  label: 'T&C Forecast',                description: 'Required pace to completion',                    category: 'tnc' },
  tnc_action_plan:    { key: 'tnc_action_plan',    number: 6,  label: 'T&C Action Plan',             description: 'Critical / At-risk triggers',                    category: 'tnc' },
  defect_snapshot:    { key: 'defect_snapshot',    number: 7,  label: 'Defect Snapshot',             description: 'Completion & closure KPIs',                      category: 'defect' },
  defect_scurve:      { key: 'defect_scurve',      number: 8,  label: 'Defect Plan vs Actual',       description: 'S-curve plan vs actual',                         category: 'defect' },
  defect_forecast:    { key: 'defect_forecast',    number: 9,  label: 'Defect Forecast',             description: 'Required pace to completion',                    category: 'defect' },
  defect_action_plan: { key: 'defect_action_plan', number: 10, label: 'Defect Action Plan',          description: 'Critical / At-risk triggers',                    category: 'defect' },
  docs_snapshot:      { key: 'docs_snapshot',      number: 11, label: 'Close Out Documents',         description: 'ABD / OMM / Warranty / Spare Part',              category: 'docs' },
  punch_snapshot:     { key: 'punch_snapshot',     number: 12, label: 'Punch List',                  description: 'Status, completion-date timeline, top 3 latest', category: 'punch' },
};

/**
 * Load the full slide registry (built-in + custom from DB).
 * Returns a Record keyed by slide key.
 */
export async function loadSlideRegistry(): Promise<Record<string, SlideMeta>> {
  const out: Record<string, SlideMeta> = { ...SLIDE_REGISTRY };
  try {
    const customs = await fetchCustomSlides();
    let n = DEFAULT_SLIDE_ORDER.length;
    for (const c of customs) {
      n += 1;
      out[c.key] = {
        key: c.key,
        number: n,
        label: c.label,
        description: c.spec.subtitle ?? 'Custom slide',
        category: 'custom',
        isCustom: true,
        customId: c.id,
      };
    }
  } catch (err) {
    console.warn('[slide-registry] failed to load custom slides:', err);
  }
  return out;
}

export { DEFAULT_SLIDE_ORDER };
export type { SlideKey };
