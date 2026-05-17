// Registry of overridable text fields per slide.
// Only keys defined here can be customized through SlideTextEditor.

import type { SlideKey } from '@/lib/ppt-builder';

export interface TextToken {
  key: string;
  label: string;
  default: string;
  multiline?: boolean;
}

export const TEXT_TOKEN_REGISTRY: Record<SlideKey, TextToken[]> = {
  cover: [
    { key: 'subtitle_line1', label: 'Subtitle Line 1', default: 'Completion Management status —' },
    { key: 'subtitle_line2', label: 'Subtitle Line 2', default: 'D-30 readiness review.' },
  ],
  dashboard: [
    { key: 'headline', label: 'Headline', default: 'Four workstreams — four risk profiles', multiline: true },
  ],
  tnc_snapshot: [
    { key: 'headline', label: 'Headline', default: 'Tests running ahead — Test Report has not started.', multiline: true },
  ],
  tnc_scurve: [
    { key: 'headline', label: 'Headline', default: 'Tests are running ahead — reports have not started.', multiline: true },
  ],
  tnc_forecast: [
    { key: 'headline', label: 'Headline', default: 'Plan trajectory by milestone date', multiline: true },
  ],
  tnc_action_plan: [
    { key: 'headline', label: 'Headline', default: 'Test Report submission requires immediate start', multiline: true },
    { key: 'left_panel_title',  label: 'Left Panel Title',  default: 'Key Causes & Action Items' },
    { key: 'right_panel_title', label: 'Right Panel Title', default: 'Cooperation Requests & Owners' },
  ],
  defect_snapshot: [
    { key: 'headline', label: 'Headline', default: 'Completion is ahead. Closure is not.', multiline: true },
  ],
  defect_scurve: [
    { key: 'headline', label: 'Headline', default: 'Completion is ahead — Closure is critically behind plan.', multiline: true },
  ],
  defect_forecast: [
    { key: 'headline', label: 'Headline', default: 'Defect plan trajectory by milestone.', multiline: true },
  ],
  defect_action_plan: [
    { key: 'headline', label: 'Headline', default: 'Defect Closure is critically behind', multiline: true },
    { key: 'left_panel_title',  label: 'Left Panel Title',  default: 'Suggested Alternatives' },
    { key: 'right_panel_title', label: 'Right Panel Title', default: 'Cooperation Requests & Owners' },
  ],
  docs_snapshot: [
    { key: 'headline', label: 'Headline', default: 'Document submissions progressing — Warranty and Spare Parts lagging.', multiline: true },
  ],
  punch_snapshot: [
    { key: 'headline',       label: 'Headline',       default: '84 items not started — 23 will be over SC.', multiline: true },
    { key: 'deadline_label', label: 'Deadline Label', default: 'SC · Substantial Completion · 2026-06-15' },
  ],
};

export type TextOverrideMap = Record<string, Record<string, string>>;

export function resolveText(
  overrides: TextOverrideMap | undefined,
  slideKey: string,
  fieldKey: string,
  fallback: string,
): string {
  const v = overrides?.[slideKey]?.[fieldKey];
  return (typeof v === 'string' && v.length > 0) ? v : fallback;
}
