export type AppRole = 'guest' | 'super_guest' | 'user' | 'senior_user' | 'd_superuser' | 'superuser' | 'admin';
export type UserType = 'subcontractor' | 'subsub' | 'hdec' | 'pm_pd' | 'admin' | 'guest';
export type TcStatus = 'Planned' | 'WIP' | 'Done' | 'Hold';
export type DataSource = 'legacy_import_inherited' | 'app_direct_input' | 'mobile_input' | 'standard_import' | 'admin_edit';
export type ChangeSource = 'app_direct_input' | 'mobile_input' | 'excel_import' | 'admin_edit';

export const TC_STATUS_OPTIONS: TcStatus[] = ['Planned', 'WIP', 'Done', 'Hold'];

// R1/R2 Report Status (mirrors PostgreSQL enum public.report_status)
export type ReportStatus = 'Planned' | 'Submitted' | 'Under Review' | 'Approved' | 'Returned';
// Full enum value list — used for legacy reads and admin tools.
export const REPORT_STATUS_OPTIONS: ReportStatus[] = ['Planned', 'Submitted', 'Under Review', 'Approved', 'Returned'];

// Stage-specific input options shown in dropdowns.
export const R1_STATUS_OPTIONS: ReportStatus[] = ['Planned', 'Submitted', 'Under Review', 'Approved', 'Returned'];
// R2 is simplified to a 3-state lifecycle in the UI.
export const R2_STATUS_OPTIONS: ReportStatus[] = ['Planned', 'Submitted', 'Approved'];

// R1 is considered "submitted/done" once it has left contractor's hand
export const R1_DONE_STATUSES: ReportStatus[] = ['Submitted', 'Under Review', 'Approved'];
// R2 submission milestone reached when status >= Submitted
export const R2_SUBMITTED_STATUSES: ReportStatus[] = ['Submitted', 'Approved'];
// R2 final completion = HDEC report Approved by client
export const R2_DONE_STATUSES: ReportStatus[] = ['Approved'];

export const isR1Done = (s: ReportStatus | string | null | undefined): boolean =>
  !!s && (R1_DONE_STATUSES as string[]).includes(s);
export const isR2Submitted = (s: ReportStatus | string | null | undefined): boolean =>
  !!s && (R2_SUBMITTED_STATUSES as string[]).includes(s);
export const isR2Done = (s: ReportStatus | string | null | undefined): boolean =>
  !!s && (R2_DONE_STATUSES as string[]).includes(s);

export const ALL_ROLES: AppRole[] = ['guest', 'super_guest', 'user', 'senior_user', 'd_superuser', 'superuser', 'admin'];
export const ALL_USER_TYPES: UserType[] = ['subcontractor', 'subsub', 'hdec', 'pm_pd', 'admin'];

export type TeamType = 'Mech' | 'Elec' | 'Arch' | 'Supp' | 'Design';
export const ALL_TEAMS: TeamType[] = ['Mech', 'Elec', 'Arch', 'Supp', 'Design'];
export const TEAM_LABELS: Record<TeamType, string> = {
  Mech: 'Mechanical',
  Elec: 'Electrical',
  Arch: 'Architectural',
  Supp: 'Support',
  Design: 'Design',
};

/**
 * Display helper: convert team enum value (e.g. 'Mech') to full label ('Mechanical').
 * - null/empty → '—'
 * - enum value → TEAM_LABELS[value]
 * - already full label ('Mechanical') → returned as-is
 * - unknown → original value
 */
export function formatTeamLabel(value: string | null | undefined): string {
  if (value == null) return '—';
  const trimmed = String(value).trim();
  if (!trimmed) return '—';
  if (trimmed in TEAM_LABELS) return TEAM_LABELS[trimmed as TeamType];
  return trimmed;
}

const normalizeTeamToken = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export function normalizeTeamValue(value: unknown): TeamType | null {
  const token = normalizeTeamToken(value);
  if (!token) return null;

  if (['arch', 'architectural', 'architecture', 'archtectural', 'landscaping', 'facade', 'structural'].includes(token)) return 'Arch';
  if (['elec', 'electrical', 'ict', 'sbt', 'verticaltransport'].includes(token)) return 'Elec';
  if (['mech', 'mechanical', 'acmv', 'bms', 'plumbing', 'sanitary', 'santary', 'gas', 'fireprotection'].includes(token)) return 'Mech';
  if (['supp', 'support'].includes(token)) return 'Supp';
  if (['design', 'designer', 'designteam', 'designdept', 'designdepartment'].includes(token)) return 'Design';

  return null;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  guest: 'Guest',
  super_guest: 'Super Guest',
  user: 'User',
  senior_user: 'Senior User',
  d_superuser: 'D.Super User',
  superuser: 'Superuser',
  admin: 'Admin',
};

export const USER_TYPE_LABELS: Record<UserType, string> = {
  subcontractor: 'Subcontractor',
  subsub: 'Sub-Sub',
  hdec: 'HDEC',
  pm_pd: 'PM/PD',
  admin: 'Administrator',
};

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  legacy_import_inherited: 'Legacy Import',
  app_direct_input: 'App Input',
  mobile_input: 'Mobile',
  standard_import: 'Standard Import',
  admin_edit: 'Admin Edit',
};

// Password policy: 6+ chars, must contain at least one letter and one digit; special chars optional
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{6,}$/;
export const PASSWORD_HINT = 'At least 6 characters; must include letters and numbers. Special characters are optional.';
export const DEFAULT_PASSWORD = 'Shaw@2026!';

// Login ID → fake email conversion (Supabase Auth requires email)
export const FAKE_EMAIL_DOMAIN = 'shaw.local';
export const loginIdToEmail = (loginId: string) =>
  `${loginId.trim().toLowerCase()}@${FAKE_EMAIL_DOMAIN}`;
