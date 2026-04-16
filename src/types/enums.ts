export type AppRole = 'subcontractor' | 'hdec_engineer' | 'manager' | 'superuser' | 'admin';
export type TcStatus = 'Planned' | 'WIP' | 'Done' | 'Hold';
export type DataSource = 'legacy_import_inherited' | 'app_direct_input' | 'mobile_input' | 'standard_import' | 'admin_edit';
export type ChangeSource = 'app_direct_input' | 'mobile_input' | 'excel_import' | 'admin_edit';

export const TC_STATUS_OPTIONS: TcStatus[] = ['Planned', 'WIP', 'Done', 'Hold'];

export const ROLE_LABELS: Record<AppRole, string> = {
  subcontractor: 'Subcontractor',
  hdec_engineer: 'HDEC Engineer',
  manager: 'Manager',
  superuser: 'Superuser',
  admin: 'Admin',
};

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  legacy_import_inherited: 'Legacy Import',
  app_direct_input: 'App Input',
  mobile_input: 'Mobile',
  standard_import: 'Standard Import',
  admin_edit: 'Admin Edit',
};
