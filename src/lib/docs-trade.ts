/**
 * Derives a "Trade" category from the drawing sheet name.
 *
 * Trade is NOT stored in the database. It is a single, derived category that
 * is computed at render time from `sheet_name`. The DB `discipline` column is
 * kept independently and is unrelated to this value.
 *
 * Matching is done case-insensitively against a small ordered ruleset.
 * Order matters — the FIRST match wins.
 */

export type TradeCategory =
  | 'Architecture'
  | 'Structure'
  | 'Mechanical'
  | 'Electrical'
  | 'Plumbing'
  | 'Fire Protection'
  | 'HVAC'
  | 'Civil'
  | 'Landscape'
  | 'Interior'
  | 'Other';

interface Rule {
  trade: TradeCategory;
  /** Patterns matched as substrings in the upper-cased sheet name. */
  patterns: string[];
}

const RULES: Rule[] = [
  { trade: 'Fire Protection', patterns: ['FIRE', 'FP-', 'FP_'] },
  { trade: 'HVAC', patterns: ['HVAC', 'AIR-COND', 'AC-', 'VENT'] },
  { trade: 'Mechanical', patterns: ['MECH', 'MEC-', 'MEC_', 'ME-', 'ME_'] },
  { trade: 'Electrical', patterns: ['ELEC', 'ELE-', 'ELE_', 'EL-', 'EL_', 'POWER', 'LIGHTING'] },
  { trade: 'Plumbing', patterns: ['PLUMB', 'PLU-', 'PLU_', 'WATER', 'DRAIN', 'SANIT'] },
  { trade: 'Structure', patterns: ['STRUCT', 'STR-', 'STR_', 'STEEL', 'CONC-', 'REBAR'] },
  { trade: 'Architecture', patterns: ['ARCH', 'ARC-', 'ARC_', 'AR-', 'AR_'] },
  { trade: 'Civil', patterns: ['CIVIL', 'CIV-', 'CIV_'] },
  { trade: 'Landscape', patterns: ['LAND', 'LSC-', 'LSC_'] },
  { trade: 'Interior', patterns: ['INT-', 'INT_', 'INTERIOR', 'FFE'] },
];

/** Return the derived trade category for a given sheet name (or '—' when none). */
export function getTradeFromSheetName(sheetName: string | null | undefined): TradeCategory | '—' {
  if (!sheetName) return '—';
  const upper = sheetName.toUpperCase();
  for (const rule of RULES) {
    if (rule.patterns.some((p) => upper.includes(p))) return rule.trade;
  }
  return 'Other';
}

/** All possible trade values, used to populate the multi-select filter. */
export const TRADE_OPTIONS: TradeCategory[] = [
  'Architecture',
  'Structure',
  'Mechanical',
  'Electrical',
  'Plumbing',
  'Fire Protection',
  'HVAC',
  'Civil',
  'Landscape',
  'Interior',
  'Other',
];
