/**
 * Shared origin → header style mapping.
 *
 * Single source of truth for the colored Raw Data column headers driven by
 * Field Config `source_origin` (HDEC / Aconex / System).
 *
 * The same palette is used by `ColumnSelectDialog` badges so the import flow
 * and Raw Data tables stay visually consistent.
 */
export type Origin = 'hdec' | 'aconex' | 'system';

export interface OriginHeaderStyle {
  /** Tailwind classes for the <th> background (works in light + dark). */
  bg: string;
  /** Inline background color used when the column is sticky/frozen. Sticky
   *  columns set an inline `background` style which overrides Tailwind, so
   *  we mirror the same color here. Uses HSL design tokens. */
  stickyBg: string;
  /** Border-bottom accent. */
  border: string;
  /** Short label shown in tooltips/badges. */
  label: string;
}

/**
 * NOTE: keep these palettes in sync with `ColumnSelectDialog` badges:
 *   hdec    → blue
 *   aconex  → emerald
 *   system  → slate (treated as "neutral" → no special tint)
 */
export const ORIGIN_HEADER_STYLES: Record<Origin, OriginHeaderStyle> = {
  hdec: {
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    stickyBg: 'hsl(214 95% 96%)',
    border: 'border-b-blue-300 dark:border-b-blue-800',
    label: 'HDEC',
  },
  aconex: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    stickyBg: 'hsl(150 80% 96%)',
    border: 'border-b-emerald-300 dark:border-b-emerald-800',
    label: 'Aconex',
  },
  system: {
    // System = neutral: keep default background so it doesn't overpower the UI.
    bg: '',
    stickyBg: 'hsl(var(--background))',
    border: '',
    label: 'System',
  },
};

export function getOriginHeaderStyle(origin: Origin | string | null | undefined): OriginHeaderStyle {
  const o = (origin ?? 'system') as Origin;
  return ORIGIN_HEADER_STYLES[o] ?? ORIGIN_HEADER_STYLES.system;
}
