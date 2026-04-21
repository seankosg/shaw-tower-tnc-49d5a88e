export type AppRole = 'guest' | 'super_guest' | 'user' | 'senior_user' | 'superuser' | 'admin';
export type UserType = 'subcontractor' | 'hdec' | 'pm_pd' | 'admin';
export type TcStatus = 'Planned' | 'WIP' | 'Done' | 'Hold';
export type DataSource = 'legacy_import_inherited' | 'app_direct_input' | 'mobile_input' | 'standard_import' | 'admin_edit';
export type ChangeSource = 'app_direct_input' | 'mobile_input' | 'excel_import' | 'admin_edit';

export const TC_STATUS_OPTIONS: TcStatus[] = ['Planned', 'WIP', 'Done', 'Hold'];

export const ALL_ROLES: AppRole[] = ['guest', 'super_guest', 'user', 'senior_user', 'superuser', 'admin'];
export const ALL_USER_TYPES: UserType[] = ['subcontractor', 'hdec', 'pm_pd', 'admin'];

export type TeamType = 'Mech' | 'Elec' | 'Arch' | 'Supp';
export const ALL_TEAMS: TeamType[] = ['Mech', 'Elec', 'Arch', 'Supp'];
export const TEAM_LABELS: Record<TeamType, string> = {
  Mech: 'Mechanical',
  Elec: 'Electrical',
  Arch: 'Architecture',
  Supp: 'Support',
};

export const ROLE_LABELS: Record<AppRole, string> = {
  guest: 'Guest',
  super_guest: 'Super Guest',
  user: 'User',
  senior_user: 'Senior User',
  superuser: 'Superuser',
  admin: 'Admin',
};

export const USER_TYPE_LABELS: Record<UserType, string> = {
  subcontractor: 'Subcontractor',
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

// Password policy: exactly 6 chars, must contain lowercase + uppercase + digit
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{6}$/;
export const PASSWORD_HINT = 'Exactly 6 characters; must include uppercase, lowercase, and a digit.';
export const DEFAULT_PASSWORD = 'SHAW00';

// Login ID → fake email conversion (Supabase Auth requires email)
export const FAKE_EMAIL_DOMAIN = 'shaw.local';
export const loginIdToEmail = (loginId: string) =>
  `${loginId.trim().toLowerCase()}@${FAKE_EMAIL_DOMAIN}`;
