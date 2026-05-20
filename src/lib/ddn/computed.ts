/**
 * Computed-field calculators for DDN inputs.
 * Each function receives the current entry inputs + settings + (optional) history aggregates
 * and returns a display string. UI renders these as read-only.
 */
import type { DdnInputs, DdnSettings } from './schema-types';

const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(x) ? x : 0;
};

const fmt = (v: number, decimals = 0): string =>
  v.toLocaleString('en-US', { maximumFractionDigits: decimals });

const fmtMoney = (v: number): string =>
  v.toLocaleString('en-US', { maximumFractionDigits: 0 });

export interface DdnComputedContext {
  inputs: DdnInputs;
  settings: DdnSettings | null;
  /** Cumulative aggregates from past entries (computed by aggregator below). */
  history?: DdnHistoryAggregate;
  today: string; // ISO yyyy-mm-dd
}

export interface DdnHistoryAggregate {
  cum_korean_md: number;
  cum_hdec_md: number;
  cum_hse_penalty: number;
  yesterday_aggregate: number;
}

const pct = (actual: unknown, plan: unknown): string => {
  const p = n(plan);
  if (p <= 0) return '—';
  return `${Math.round((n(actual) / p) * 100)}`;
};

const dayDiff = (fromIso: string | null | undefined, toIso: string): number => {
  if (!fromIso) return 0;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
};

export const COMPUTED: Record<string, (ctx: DdnComputedContext) => string> = {
  // Planned-tests achievement %
  'planned_tests.pred_pct': ({ inputs }) => pct(inputs['planned_tests.pred_actual'], inputs['planned_tests.pred_plan']),
  'planned_tests.t1_pct':   ({ inputs }) => pct(inputs['planned_tests.t1_actual'],   inputs['planned_tests.t1_plan']),
  'planned_tests.t2_pct':   ({ inputs }) => pct(inputs['planned_tests.t2_actual'],   inputs['planned_tests.t2_plan']),

  // §2 progress
  'sec2.delay_days': ({ settings, today }) =>
    fmt(dayDiff(settings?.contract_completion_date ?? null, today)),

  'sec2.ld_accumulated': ({ settings, today }) => {
    const days = dayDiff(settings?.contract_completion_date ?? null, today);
    const rate = n(settings?.ld_daily_rate_sgd);
    const cap = n(settings?.ld_cap_sgd);
    return fmtMoney(Math.min(days * rate, cap));
  },

  // §8 cumulative
  'sec8.cum_pm_absent': ({ settings, today }) =>
    fmt(dayDiff(settings?.pm_absence_start_date ?? null, today)),

  'sec8.cum_hdec_md': ({ inputs, history }) =>
    fmt(n(history?.cum_hdec_md) + n(inputs['sec8.input_hdec_md'])),

  'sec8.cum_korean_md': ({ inputs, history }) =>
    fmt(n(history?.cum_korean_md) + n(inputs['sec8.input_korean_md'])),

  'sec8.cum_pm_charge': ({ settings, today }) => {
    const days = dayDiff(settings?.pm_absence_start_date ?? null, today);
    return fmtMoney(days * n(settings?.pm_daily_rate_sgd));
  },

  'sec8.cum_def_ncr_cost': ({ inputs, settings }) => {
    const ovh = 1 + n(settings?.admin_overhead_pct);
    const ncr = n(inputs['sec3.ncr_open']) * n(settings?.avg_ncr_external_cost) * ovh;
    const def = n(inputs['sec3.def_open']) * n(settings?.avg_def_external_cost) * ovh;
    return fmtMoney(ncr + def);
  },

  'sec8.cum_hse_penalty': ({ inputs, history }) =>
    fmtMoney(n(history?.cum_hse_penalty) + n(inputs['sec7.hse_penalty_amount'])),

  'sec8.cum_ld': ({ settings, today }) => {
    const days = dayDiff(settings?.contract_completion_date ?? null, today);
    const rate = n(settings?.ld_daily_rate_sgd);
    const cap = n(settings?.ld_cap_sgd);
    return fmtMoney(Math.min(days * rate, cap));
  },

  'sec8.aggregate': (ctx) => {
    const totals = [
      'sec8.cum_pm_charge',
      'sec8.cum_def_ncr_cost',
      'sec8.cum_hse_penalty',
      'sec8.cum_ld',
    ].map((k) => parseAmount(COMPUTED[k](ctx)));
    const ovh = 1 + n(ctx.settings?.admin_overhead_pct);
    const hdec = (n(ctx.history?.cum_hdec_md) + n(ctx.inputs['sec8.input_hdec_md']))
      * n(ctx.settings?.hdec_manday_rate_sgd) * ovh;
    const korean = (n(ctx.history?.cum_korean_md) + n(ctx.inputs['sec8.input_korean_md']))
      * n(ctx.settings?.hdec_korean_md_rate_sgd) * ovh;
    return fmtMoney(totals.reduce((a, b) => a + b, 0) + hdec + korean);
  },

  'sec8.delta_yesterday': (ctx) => {
    const agg = parseAmount(COMPUTED['sec8.aggregate'](ctx));
    return fmtMoney(agg - n(ctx.history?.yesterday_aggregate));
  },
};

function parseAmount(s: string): number {
  return n(s.replace(/[, ]/g, ''));
}

export function computeField(key: string, ctx: DdnComputedContext): string {
  const fn = COMPUTED[key];
  return fn ? fn(ctx) : '—';
}
