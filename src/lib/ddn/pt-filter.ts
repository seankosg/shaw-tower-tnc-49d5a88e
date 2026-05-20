/**
 * Puretech scope filter — single source of truth for "what counts as Puretech work".
 * Add other Puretech entity names here if onboarded later (e.g. 'Puretech-2').
 * sub-sub contractors are automatically included because they carry subcontractor_name='Puretech'
 * and their identity lives in `subsub_name` (filter never excludes sub-subs).
 */
export const PT_NAMES = ['Puretech'] as const;
export type PtName = (typeof PT_NAMES)[number];
