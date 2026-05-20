/**
 * RTO outstanding counts (sec6) — map DDN field keys to punch_items filter rules.
 * Tune these as operations confirms actual main_trade / keyword conventions.
 */
export interface PunchTradeFilter {
  mainTrade: string;
  /** Optional keyword matched against description OR sub_trade (ILIKE %kw%). */
  keyword?: string;
}

export const RTO_TRADE_MAP: Record<string, PunchTradeFilter> = {
  'sec6.rto_cctv':  { mainTrade: 'ELV', keyword: 'CCTV' },
  'sec6.rto_fi':    { mainTrade: 'FP' },
  'sec6.rto_oi':    { mainTrade: 'ICN' },
  'sec6.rto_smart': { mainTrade: 'ELV', keyword: 'smart' },
  'sec6.rto_pa':    { mainTrade: 'PSG' },
};
