// Slide metadata for the PPT composer UI.
// The actual builder functions live in `ppt-builder.ts`; this file only
// describes each slide for selection / reordering purposes.

import type { SlideKey } from '@/lib/ppt-builder';
import { DEFAULT_SLIDE_ORDER } from '@/lib/ppt-builder';

export type SlideCategory = 'intro' | 'overview' | 'tnc' | 'defect' | 'docs' | 'punch';

export interface SlideMeta {
  key: SlideKey;
  number: number;       // 1-based slide number in default order
  label: string;        // UI label
  description: string;  // short helper text
  category: SlideCategory;
}

export const SLIDE_REGISTRY: Record<SlideKey, SlideMeta> = {
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

export { DEFAULT_SLIDE_ORDER };
export type { SlideKey };
