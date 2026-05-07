// Tables to back up, in dependency order (parents first).
// Used by both auto-snapshot and restore-snapshot.
export const BACKUP_TABLES: string[] = [
  // 1. Masters / settings
  "projects",
  "hdec_eng_master",
  "hdec_pic_master",
  "subcontractor_master",
  "subcontractor_info_master",
  "system_master",
  "system_alias_map",
  "app_settings",
  "field_config",
  "defect_field_config",
  "docs_field_config",
  "custom_field_definitions",
  "defect_classification_rules",
  "defect_classification_alias",
  "defect_subcontractor_workscope",
  "defect_work_types",
  "defect_discipline_fallback",
  "docs_org_alias",
  "import_header_mappings",
  "subcontractor_issue_counters",

  // 2. Users / permissions metadata (auth.users itself is not included)
  "profiles",
  "user_roles",
  "user_system_permissions",

  // 3. Upload batch headers
  "upload_batches",
  "defect_upload_batches",
  "docs_upload_batches",
  "warranty_upload_batches",

  // 4. Core business
  "tests",
  "subtests",
  "defect_items",
  "docs_drawings",
  "docs_omm",
  "docs_spare_part",
  "warranty_items",
  "warranty_threads",

  // 5. Children / history / audit
  "subtest_comments",
  "subtest_comment_reads",
  "subtest_change_log",
  "schedule_change_audit",
  "defect_comments",
  "defect_comment_reads",
  "defect_change_log",
  "defect_schedule_change_audit",
  "defect_daily_snapshots",
  "sc_no_history",
  "docs_change_log",
  "omm_comments",
  "warranty_comments",
  "warranty_change_log",
  "upload_row_logs",
  "defect_upload_row_logs",
  "docs_upload_row_logs",
  "warranty_upload_row_logs",
  "import_field_logs",
  "event_log",
];
