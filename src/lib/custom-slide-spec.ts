/**
 * Custom Slide spec — JSON-based runtime slide definition.
 *
 * The New Slide Generator produces a SlideSpec; the renderer
 * (custom-slide-renderer.ts) interprets it at PPT-export time so end users
 * can add new slides without code changes or redeploys.
 */
import { z } from 'zod';

export const SPEC_VERSION = 1 as const;

// ─── Data path resolution ────────────────────────────────────────────

export interface KpiBag {
  tnc?: unknown;
  defect?: unknown;
  docs?: unknown;
  punch?: unknown;
  // Wildcards: 'data' = full ReportData, 'meta' = data.meta
  data?: unknown;
  meta?: unknown;
}

/**
 * Resolve a dotted path like "tnc.completion.pct" or "defect.scurve[0].planned".
 * Returns undefined if any segment is missing.
 */
export function resolvePath(root: KpiBag, path: string): unknown {
  if (!path) return undefined;
  // Normalise bracket indices: a[0].b → a.0.b
  const norm = path.replace(/\[(\d+)\]/g, '.$1');
  const parts = norm.split('.').filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Format a value as a display string. */
export function fmtValue(v: unknown, opts?: { unit?: string; decimals?: number }): string {
  if (v == null) return '—';
  if (typeof v === 'number') {
    const n = opts?.decimals != null ? v.toFixed(opts.decimals) : Math.round(v * 10) / 10;
    return `${n}${opts?.unit ? ' ' + opts.unit : ''}`.trim();
  }
  return String(v);
}

// ─── Block schemas ───────────────────────────────────────────────────

const BaseBlock = z.object({
  // Optional absolute position (in inches). When omitted the renderer
  // auto-stacks blocks vertically inside the body area.
  x: z.number().optional(),
  y: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
});

const KpiCardBlock = BaseBlock.extend({
  type: z.literal('kpi-card'),
  title: z.string(),
  valuePath: z.string(),
  unit: z.string().optional(),
  decimals: z.number().int().min(0).max(4).optional(),
  barPath: z.string().optional(),     // 0-100 number
  subtitle: z.string().optional(),
  color: z.string().optional(),       // hex without '#'
});

const BarRowBlock = BaseBlock.extend({
  type: z.literal('bar-row'),
  label: z.string(),
  pctPath: z.string(),
  color: z.string().optional(),
});

const MetricGridBlock = BaseBlock.extend({
  type: z.literal('metric-grid'),
  columns: z.number().int().min(1).max(4).optional(),
  items: z.array(z.object({
    label: z.string(),
    valuePath: z.string(),
    unit: z.string().optional(),
    decimals: z.number().int().min(0).max(4).optional(),
    color: z.string().optional(),
  })).min(1).max(8),
});

const TextBlock = BaseBlock.extend({
  type: z.literal('text-block'),
  text: z.string(),
  fontSize: z.number().optional(),
  bold: z.boolean().optional(),
  color: z.string().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
});

const BulletListBlock = BaseBlock.extend({
  type: z.literal('bullet-list'),
  title: z.string().optional(),
  items: z.array(z.string()).min(1).max(12),
});

const SimpleTableBlock = BaseBlock.extend({
  type: z.literal('simple-table'),
  title: z.string().optional(),
  headers: z.array(z.string()).min(1).max(8),
  // Either inline rows OR a path to an array of objects + columnPaths.
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).optional(),
  rowsPath: z.string().optional(),
  columnPaths: z.array(z.string()).optional(),
  colWidths: z.array(z.number()).optional(),
});

const ChartSeriesRef = z.object({
  name: z.string(),
  valuesPath: z.string(), // path to number[] OR array of objects
  valueField: z.string().optional(), // when valuesPath returns objects
  color: z.string().optional(),
});

const BarChartBlock = BaseBlock.extend({
  type: z.literal('bar-chart'),
  title: z.string().optional(),
  orientation: z.enum(['col', 'bar']).optional(),
  labelsPath: z.string(),       // path to string[] OR array of objects
  labelField: z.string().optional(),
  series: z.array(ChartSeriesRef).min(1).max(4),
});

const LineChartBlock = BaseBlock.extend({
  type: z.literal('line-chart'),
  title: z.string().optional(),
  labelsPath: z.string(),
  labelField: z.string().optional(),
  series: z.array(ChartSeriesRef).min(1).max(4),
});

const PieChartBlock = BaseBlock.extend({
  type: z.literal('pie-chart'),
  title: z.string().optional(),
  doughnut: z.boolean().optional(),
  labelsPath: z.string(),
  labelField: z.string().optional(),
  valuesPath: z.string(),
  valueField: z.string().optional(),
});

const StackedBarBlock = BaseBlock.extend({
  type: z.literal('stacked-bar'),
  title: z.string().optional(),
  orientation: z.enum(['col', 'bar']).optional(),
  labelsPath: z.string(),
  labelField: z.string().optional(),
  series: z.array(ChartSeriesRef).min(2).max(6),
});

export const BlockSchema = z.discriminatedUnion('type', [
  KpiCardBlock, BarRowBlock, MetricGridBlock, TextBlock, BulletListBlock,
  SimpleTableBlock, BarChartBlock, LineChartBlock, PieChartBlock, StackedBarBlock,
]);

export type SlideBlock = z.infer<typeof BlockSchema>;

export const SlideSpecSchema = z.object({
  version: z.literal(SPEC_VERSION).default(SPEC_VERSION),
  title: z.string(),
  subtitle: z.string().optional(),
  layout: z.enum(['single', 'two-column', 'three-column', 'free']).default('single'),
  blocks: z.array(BlockSchema).min(1).max(12),
});

export type SlideSpec = z.infer<typeof SlideSpecSchema>;

/** Catalog used by the AI edge function so it knows what's available. */
export const DATA_PATH_CATALOG: { path: string; kind: 'number' | 'array' | 'object'; note: string }[] = [
  { path: 'tnc.total',                    kind: 'number', note: 'Total T&C subtests' },
  { path: 'tnc.preTest.pct',              kind: 'number', note: 'Pre-Test completion %' },
  { path: 'tnc.preTest.done',             kind: 'number', note: 'Pre-Test completed count' },
  { path: 'tnc.official.pct',             kind: 'number', note: 'Official Test %' },
  { path: 'tnc.official.done',            kind: 'number', note: 'Official Test count' },
  { path: 'tnc.testReport.pct',           kind: 'number', note: 'Test Report %' },
  { path: 'tnc.testReport.done',          kind: 'number', note: 'Test Report count' },
  { path: 'tnc.daysToPC',                 kind: 'number', note: 'Days to project completion' },
  { path: 'tnc.scurve',                   kind: 'array',  note: 'Weekly array {weekLabel, plannedPct, actualPct}' },
  { path: 'defect.total',                 kind: 'number', note: 'Total defects' },
  { path: 'defect.completion.pct',        kind: 'number', note: 'Defect completion %' },
  { path: 'defect.closure.pct',           kind: 'number', note: 'Defect closure %' },
  { path: 'defect.scurve',                kind: 'array',  note: 'Weekly array' },
  { path: 'docs.abd.total',               kind: 'number', note: 'ABD total' },
  { path: 'docs.omm.total',               kind: 'number', note: 'OMM total' },
  { path: 'docs.warranty.total',          kind: 'number', note: 'Warranty total' },
  { path: 'docs.sparePart.total',         kind: 'number', note: 'Spare Part total' },
  { path: 'punch.total',                  kind: 'number', note: 'Total punch items' },
  { path: 'punch.completion.pct',         kind: 'number', note: 'Punch completion %' },
  { path: 'punch.statusBreakdown',        kind: 'object', note: 'Status counts object' },
  { path: 'punch.completionDateBreakdown.monthlyBeyondSc', kind: 'array', note: 'Monthly beyond-SC array' },
  { path: 'punch.latestItems',            kind: 'array',  note: 'Latest punch items array' },
];
