// Registry of overridable text fields per slide.
// Only keys defined here can be customized through SlideTextEditor.
//
// Special slide key `__common` holds tokens shared across ALL slides
// (e.g. footer text). resolveText() falls back from slide-specific →
// `__common` → built-in default.

import type { SlideKey } from '@/lib/ppt-builder';

export interface TextToken {
  key: string;
  label: string;
  default: string;
  multiline?: boolean;
}

export const COMMON_SLIDE_KEY = '__common';

/** Tokens shared across every slide. Looked up under the `__common` slide key. */
export const COMMON_TOKENS: TextToken[] = [
  { key: 'footer_brand',    label: 'Footer Brand',     default: 'SHAW · Status Report' },
  { key: 'footer_page_fmt', label: 'Footer Page Format (use {n})', default: 'Page {n}' },
];

export const TEXT_TOKEN_REGISTRY: Record<SlideKey, TextToken[]> = {
  cover: [
    { key: 'eyebrow',        label: 'Eyebrow',          default: 'PROJECT STATUS REPORT' },
    { key: 'title_line1',    label: 'Title Line 1',     default: 'SHAW TOWER' },
    { key: 'title_line2',    label: 'Title Line 2',     default: 'Completion Management' },
    { key: 'subtitle_line1', label: 'Subtitle Line 1',  default: 'Completion Management status —' },
    { key: 'subtitle_line2', label: 'Subtitle Line 2',  default: 'D-30 readiness review.' },
    { key: 'date_label',     label: 'Date Label',       default: 'Report Date' },
    { key: 'org_label',      label: 'Organization',     default: 'HDEC' },
  ],
  dashboard: [
    { key: 'headline',  label: 'Headline',  default: 'Four workstreams — four risk profiles', multiline: true },
    { key: 'col_tnc',   label: 'Column 1 Label', default: 'T&C' },
    { key: 'col_defect',label: 'Column 2 Label', default: 'Defects' },
    { key: 'col_docs',  label: 'Column 3 Label', default: 'Documents' },
    { key: 'col_punch', label: 'Column 4 Label', default: 'Punch' },
  ],
  tnc_snapshot: [
    { key: 'headline', label: 'Headline', default: 'Tests running ahead — Test Report has not started.', multiline: true },
    { key: 'subhead',  label: 'Sub Headline', default: '' },
    { key: 'footnote', label: 'Footnote',     default: '' },
  ],
  tnc_scurve: [
    { key: 'headline',     label: 'Headline',     default: 'Tests are running ahead — reports have not started.', multiline: true },
    { key: 'y_axis_label', label: 'Y-Axis Label', default: 'Cumulative %' },
    { key: 'legend_plan',     label: 'Legend · Plan',     default: 'Plan' },
    { key: 'legend_actual',   label: 'Legend · Actual',   default: 'Actual' },
    { key: 'legend_forecast', label: 'Legend · Forecast', default: 'Forecast' },
  ],
  tnc_forecast: [
    { key: 'headline',   label: 'Headline', default: 'Plan trajectory by milestone date', multiline: true },
    { key: 'ms_sc',      label: 'Milestone · SC',  default: 'SC' },
    { key: 'ms_mc',      label: 'Milestone · MC',  default: 'MC' },
    { key: 'ms_top',     label: 'Milestone · TOP', default: 'TOP' },
  ],
  tnc_action_plan: [
    { key: 'headline',          label: 'Headline', default: 'Test Report submission requires immediate start', multiline: true },
    { key: 'left_panel_title',  label: 'Left Panel Title',  default: 'Key Causes & Action Items' },
    { key: 'right_panel_title', label: 'Right Panel Title', default: 'Cooperation Requests & Owners' },
    { key: 'footer_callout',    label: 'Footer Callout',    default: '' },
  ],
  defect_snapshot: [
    { key: 'headline', label: 'Headline', default: 'Completion is ahead. Closure is not.', multiline: true },
    { key: 'subhead',  label: 'Sub Headline', default: '' },
    { key: 'footnote', label: 'Footnote',     default: '' },
  ],
  defect_scurve: [
    { key: 'headline',        label: 'Headline',          default: 'Completion is ahead — Closure is critically behind plan.', multiline: true },
    { key: 'y_axis_label',    label: 'Y-Axis Label',      default: 'Cumulative %' },
    { key: 'legend_plan',     label: 'Legend · Plan',     default: 'Plan' },
    { key: 'legend_actual',   label: 'Legend · Actual',   default: 'Actual' },
    { key: 'legend_forecast', label: 'Legend · Forecast', default: 'Forecast' },
  ],
  defect_forecast: [
    { key: 'headline', label: 'Headline', default: 'Defect plan trajectory by milestone.', multiline: true },
    { key: 'ms_sc',    label: 'Milestone · SC',  default: 'SC' },
    { key: 'ms_mc',    label: 'Milestone · MC',  default: 'MC' },
    { key: 'ms_top',   label: 'Milestone · TOP', default: 'TOP' },
  ],
  defect_action_plan: [
    { key: 'headline',          label: 'Headline', default: 'Defect Closure is critically behind', multiline: true },
    { key: 'left_panel_title',  label: 'Left Panel Title',  default: 'Suggested Alternatives' },
    { key: 'right_panel_title', label: 'Right Panel Title', default: 'Cooperation Requests & Owners' },
    { key: 'footer_callout',    label: 'Footer Callout',    default: '' },
  ],
  docs_snapshot: [
    { key: 'headline', label: 'Headline', default: 'Document submissions progressing — Warranty and Spare Parts lagging.', multiline: true },
    { key: 'subhead',  label: 'Sub Headline', default: '' },
    { key: 'footnote', label: 'Footnote',     default: '' },
  ],
  punch_snapshot: [
    { key: 'headline',       label: 'Headline',       default: '84 items not started — 23 will be over SC.', multiline: true },
    { key: 'deadline_label', label: 'Deadline Label', default: 'SC · Substantial Completion · 2026-06-15' },
    { key: 'subhead',        label: 'Sub Headline',   default: '' },
    { key: 'footnote',       label: 'Footnote',       default: '' },
  ],
};

export type TextOverrideMap = Record<string, Record<string, string>>;

/**
 * Resolve a text token. Lookup order:
 *   1. slide-specific override
 *   2. __common override (only if fieldKey exists in COMMON_TOKENS)
 *   3. provided fallback (default)
 */
export function resolveText(
  overrides: TextOverrideMap | undefined,
  slideKey: string,
  fieldKey: string,
  fallback: string,
): string {
  const v = overrides?.[slideKey]?.[fieldKey];
  if (typeof v === 'string' && v.length > 0) return v;
  // Only consult __common for keys defined as common tokens
  if (COMMON_TOKENS.some((t) => t.key === fieldKey)) {
    const c = overrides?.[COMMON_SLIDE_KEY]?.[fieldKey];
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return fallback;
}
