export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      database_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          row_count: number
          snapshot_data: Json
          snapshot_date: string
          snapshot_name: string
          snapshot_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          row_count?: number
          snapshot_data: Json
          snapshot_date?: string
          snapshot_name: string
          snapshot_type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          row_count?: number
          snapshot_data?: Json
          snapshot_date?: string
          snapshot_name?: string
          snapshot_type?: string
        }
        Relationships: []
      }
      defect_change_log: {
        Row: {
          change_source: string | null
          changed_at: string
          changed_by: string | null
          changed_field: string
          defect_id: string
          id: string
          new_value: string | null
          old_value: string | null
          upload_id: string | null
        }
        Insert: {
          change_source?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_field: string
          defect_id: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          upload_id?: string | null
        }
        Update: {
          change_source?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_field?: string
          defect_id?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          upload_id?: string | null
        }
        Relationships: []
      }
      defect_daily_snapshots: {
        Row: {
          actual_progress_pct: number | null
          closed_date: string | null
          closure_status: string | null
          created_at: string
          created_by: string | null
          defect_id: string
          id: string
          issue_no: string
          planned_date: string | null
          snapshot_date: string
        }
        Insert: {
          actual_progress_pct?: number | null
          closed_date?: string | null
          closure_status?: string | null
          created_at?: string
          created_by?: string | null
          defect_id: string
          id?: string
          issue_no: string
          planned_date?: string | null
          snapshot_date?: string
        }
        Update: {
          actual_progress_pct?: number | null
          closed_date?: string | null
          closure_status?: string | null
          created_at?: string
          created_by?: string | null
          defect_id?: string
          id?: string
          issue_no?: string
          planned_date?: string | null
          snapshot_date?: string
        }
        Relationships: []
      }
      defect_field_config: {
        Row: {
          display_name: string
          editable_to_roles: Database["public"]["Enums"]["app_role"][] | null
          field_name: string
          id: string
          is_enabled: boolean
          is_required: boolean
          original_header: string | null
          sort_order: number
          source_origin: string
          visible_to_roles: Database["public"]["Enums"]["app_role"][] | null
        }
        Insert: {
          display_name: string
          editable_to_roles?: Database["public"]["Enums"]["app_role"][] | null
          field_name: string
          id?: string
          is_enabled?: boolean
          is_required?: boolean
          original_header?: string | null
          sort_order?: number
          source_origin?: string
          visible_to_roles?: Database["public"]["Enums"]["app_role"][] | null
        }
        Update: {
          display_name?: string
          editable_to_roles?: Database["public"]["Enums"]["app_role"][] | null
          field_name?: string
          id?: string
          is_enabled?: boolean
          is_required?: boolean
          original_header?: string | null
          sort_order?: number
          source_origin?: string
          visible_to_roles?: Database["public"]["Enums"]["app_role"][] | null
        }
        Relationships: []
      }
      defect_items: {
        Row: {
          actual_progress_pct: number | null
          area_level: string | null
          area_location: string | null
          area_raw: string | null
          area_type: string | null
          closed_date: string | null
          closure_status: string | null
          created_at: string
          data_source_type: string | null
          defect_type: string | null
          description: string | null
          hdec_comments: string | null
          hdec_pic_name: string | null
          id: string
          is_active: boolean
          issue_no: string
          main_trade: string | null
          planned_date: string | null
          priority: string | null
          project_id: string | null
          raw_payload: Json
          remarks: string | null
          row_version: number
          source_upload_id: string | null
          status: string | null
          sub_trade: string | null
          subcontractor_issue_no: string | null
          subcontractor_issue_source: string | null
          subcontractor_name: string | null
          subsub_name: string | null
          target_date: string | null
          team: Database["public"]["Enums"]["team_type"] | null
          trade_detail: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_progress_pct?: number | null
          area_level?: string | null
          area_location?: string | null
          area_raw?: string | null
          area_type?: string | null
          closed_date?: string | null
          closure_status?: string | null
          created_at?: string
          data_source_type?: string | null
          defect_type?: string | null
          description?: string | null
          hdec_comments?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          issue_no: string
          main_trade?: string | null
          planned_date?: string | null
          priority?: string | null
          project_id?: string | null
          raw_payload?: Json
          remarks?: string | null
          row_version?: number
          source_upload_id?: string | null
          status?: string | null
          sub_trade?: string | null
          subcontractor_issue_no?: string | null
          subcontractor_issue_source?: string | null
          subcontractor_name?: string | null
          subsub_name?: string | null
          target_date?: string | null
          team?: Database["public"]["Enums"]["team_type"] | null
          trade_detail?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_progress_pct?: number | null
          area_level?: string | null
          area_location?: string | null
          area_raw?: string | null
          area_type?: string | null
          closed_date?: string | null
          closure_status?: string | null
          created_at?: string
          data_source_type?: string | null
          defect_type?: string | null
          description?: string | null
          hdec_comments?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          issue_no?: string
          main_trade?: string | null
          planned_date?: string | null
          priority?: string | null
          project_id?: string | null
          raw_payload?: Json
          remarks?: string | null
          row_version?: number
          source_upload_id?: string | null
          status?: string | null
          sub_trade?: string | null
          subcontractor_issue_no?: string | null
          subcontractor_issue_source?: string | null
          subcontractor_name?: string | null
          subsub_name?: string | null
          target_date?: string | null
          team?: Database["public"]["Enums"]["team_type"] | null
          trade_detail?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      defect_schedule_change_audit: {
        Row: {
          change_source: string | null
          closed_diff_days: number | null
          closed_new_date: string | null
          closed_old_date: string | null
          closure_status_new: string | null
          closure_status_old: string | null
          created_at: string
          created_by: string | null
          defect_id: string
          id: string
          issue_no: string
          planned_diff_days: number | null
          planned_new_date: string | null
          planned_old_date: string | null
          progress_diff_pct: number | null
          progress_new_pct: number | null
          progress_old_pct: number | null
          project_id: string | null
          raw_row_no: number | null
          subcontractor_issue_no: string | null
          target_diff_days: number | null
          target_new_date: string | null
          target_old_date: string | null
          upload_id: string | null
        }
        Insert: {
          change_source?: string | null
          closed_diff_days?: number | null
          closed_new_date?: string | null
          closed_old_date?: string | null
          closure_status_new?: string | null
          closure_status_old?: string | null
          created_at?: string
          created_by?: string | null
          defect_id: string
          id?: string
          issue_no: string
          planned_diff_days?: number | null
          planned_new_date?: string | null
          planned_old_date?: string | null
          progress_diff_pct?: number | null
          progress_new_pct?: number | null
          progress_old_pct?: number | null
          project_id?: string | null
          raw_row_no?: number | null
          subcontractor_issue_no?: string | null
          target_diff_days?: number | null
          target_new_date?: string | null
          target_old_date?: string | null
          upload_id?: string | null
        }
        Update: {
          change_source?: string | null
          closed_diff_days?: number | null
          closed_new_date?: string | null
          closed_old_date?: string | null
          closure_status_new?: string | null
          closure_status_old?: string | null
          created_at?: string
          created_by?: string | null
          defect_id?: string
          id?: string
          issue_no?: string
          planned_diff_days?: number | null
          planned_new_date?: string | null
          planned_old_date?: string | null
          progress_diff_pct?: number | null
          progress_new_pct?: number | null
          progress_old_pct?: number | null
          project_id?: string | null
          raw_row_no?: number | null
          subcontractor_issue_no?: string | null
          target_diff_days?: number | null
          target_new_date?: string | null
          target_old_date?: string | null
          upload_id?: string | null
        }
        Relationships: []
      }
      defect_upload_batches: {
        Row: {
          data_date: string | null
          id: string
          note: string | null
          processed_rows: number | null
          project_id: string | null
          rejected_rows: number | null
          skipped_rows: number | null
          status: Database["public"]["Enums"]["upload_status"]
          success_rows: number | null
          total_rows: number | null
          uploaded_at: string
          uploaded_by: string | null
          uploaded_file_name: string
        }
        Insert: {
          data_date?: string | null
          id?: string
          note?: string | null
          processed_rows?: number | null
          project_id?: string | null
          rejected_rows?: number | null
          skipped_rows?: number | null
          status?: Database["public"]["Enums"]["upload_status"]
          success_rows?: number | null
          total_rows?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_file_name: string
        }
        Update: {
          data_date?: string | null
          id?: string
          note?: string | null
          processed_rows?: number | null
          project_id?: string | null
          rejected_rows?: number | null
          skipped_rows?: number | null
          status?: Database["public"]["Enums"]["upload_status"]
          success_rows?: number | null
          total_rows?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_file_name?: string
        }
        Relationships: []
      }
      defect_upload_row_logs: {
        Row: {
          action_taken: Database["public"]["Enums"]["action_taken"] | null
          id: string
          issue_no: string | null
          processed_at: string
          raw_row_no: number | null
          reason_code: string | null
          reason_detail: string | null
          upload_id: string
        }
        Insert: {
          action_taken?: Database["public"]["Enums"]["action_taken"] | null
          id?: string
          issue_no?: string | null
          processed_at?: string
          raw_row_no?: number | null
          reason_code?: string | null
          reason_detail?: string | null
          upload_id: string
        }
        Update: {
          action_taken?: Database["public"]["Enums"]["action_taken"] | null
          id?: string
          issue_no?: string | null
          processed_at?: string
          raw_row_no?: number | null
          reason_code?: string | null
          reason_detail?: string | null
          upload_id?: string
        }
        Relationships: []
      }
      field_config: {
        Row: {
          display_name: string
          editable_to_roles: Database["public"]["Enums"]["app_role"][] | null
          field_name: string
          id: string
          is_enabled: boolean
          is_required: boolean
          sort_order: number
          visible_to_roles: Database["public"]["Enums"]["app_role"][] | null
        }
        Insert: {
          display_name: string
          editable_to_roles?: Database["public"]["Enums"]["app_role"][] | null
          field_name: string
          id?: string
          is_enabled?: boolean
          is_required?: boolean
          sort_order?: number
          visible_to_roles?: Database["public"]["Enums"]["app_role"][] | null
        }
        Update: {
          display_name?: string
          editable_to_roles?: Database["public"]["Enums"]["app_role"][] | null
          field_name?: string
          id?: string
          is_enabled?: boolean
          is_required?: boolean
          sort_order?: number
          visible_to_roles?: Database["public"]["Enums"]["app_role"][] | null
        }
        Relationships: []
      }
      hdec_pic_master: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          hdec_pic_name: string | null
          id: string
          is_active: boolean
          login_id: string
          must_change_password: boolean
          name: string | null
          subcontractor_name: string | null
          subsub_name: string | null
          team: Database["public"]["Enums"]["team_type"] | null
          user_id: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          created_at?: string
          email?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          login_id: string
          must_change_password?: boolean
          name?: string | null
          subcontractor_name?: string | null
          subsub_name?: string | null
          team?: Database["public"]["Enums"]["team_type"] | null
          user_id: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          created_at?: string
          email?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          login_id?: string
          must_change_password?: boolean
          name?: string | null
          subcontractor_name?: string | null
          subsub_name?: string | null
          team?: Database["public"]["Enums"]["team_type"] | null
          user_id?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          project_code: string
          project_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          project_code: string
          project_name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          project_code?: string
          project_name?: string
        }
        Relationships: []
      }
      schedule_change_audit: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_no: string
          mos_code: string
          pred_cur_gap_days: number | null
          pred_diff_days: number | null
          pred_new_date: string | null
          pred_old_date: string | null
          pred_prev_gap_days: number | null
          project_id: string
          raw_row_no: number | null
          subtest_code: string | null
          subtest_id: string
          system_id: string
          t1_cur_gap_days: number | null
          t1_diff_days: number | null
          t1_new_date: string | null
          t1_old_date: string | null
          t1_prev_gap_days: number | null
          t2_cur_gap_days: number | null
          t2_diff_days: number | null
          t2_new_date: string | null
          t2_old_date: string | null
          t2_prev_gap_days: number | null
          upload_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_no: string
          mos_code: string
          pred_cur_gap_days?: number | null
          pred_diff_days?: number | null
          pred_new_date?: string | null
          pred_old_date?: string | null
          pred_prev_gap_days?: number | null
          project_id: string
          raw_row_no?: number | null
          subtest_code?: string | null
          subtest_id: string
          system_id: string
          t1_cur_gap_days?: number | null
          t1_diff_days?: number | null
          t1_new_date?: string | null
          t1_old_date?: string | null
          t1_prev_gap_days?: number | null
          t2_cur_gap_days?: number | null
          t2_diff_days?: number | null
          t2_new_date?: string | null
          t2_old_date?: string | null
          t2_prev_gap_days?: number | null
          upload_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_no?: string
          mos_code?: string
          pred_cur_gap_days?: number | null
          pred_diff_days?: number | null
          pred_new_date?: string | null
          pred_old_date?: string | null
          pred_prev_gap_days?: number | null
          project_id?: string
          raw_row_no?: number | null
          subtest_code?: string | null
          subtest_id?: string
          system_id?: string
          t1_cur_gap_days?: number | null
          t1_diff_days?: number | null
          t1_new_date?: string | null
          t1_old_date?: string | null
          t1_prev_gap_days?: number | null
          t2_cur_gap_days?: number | null
          t2_diff_days?: number | null
          t2_new_date?: string | null
          t2_old_date?: string | null
          t2_prev_gap_days?: number | null
          upload_id?: string
        }
        Relationships: []
      }
      subcontractor_master: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_subcontractor_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_subcontractor_id?: string | null
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_subcontractor_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_master_parent_subcontractor_id_fkey"
            columns: ["parent_subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractor_master"
            referencedColumns: ["id"]
          },
        ]
      }
      subtest_change_log: {
        Row: {
          change_source: Database["public"]["Enums"]["change_source"] | null
          changed_at: string
          changed_by: string | null
          changed_field: string
          id: string
          new_value: string | null
          old_value: string | null
          subtest_id: string
          upload_id: string | null
        }
        Insert: {
          change_source?: Database["public"]["Enums"]["change_source"] | null
          changed_at?: string
          changed_by?: string | null
          changed_field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          subtest_id: string
          upload_id?: string | null
        }
        Update: {
          change_source?: Database["public"]["Enums"]["change_source"] | null
          changed_at?: string
          changed_by?: string | null
          changed_field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          subtest_id?: string
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subtest_change_log_subtest_id_fkey"
            columns: ["subtest_id"]
            isOneToOne: false
            referencedRelation: "subtests"
            referencedColumns: ["id"]
          },
        ]
      }
      subtests: {
        Row: {
          aconex_ref_no: string | null
          data_source_type: Database["public"]["Enums"]["data_source"] | null
          description: string | null
          equipment: string | null
          hdec_pic_name: string | null
          id: string
          is_active: boolean
          item_no: string
          level: string | null
          mos_code: string
          mos_sequence: number | null
          pred_actual_date: string | null
          pred_planned_date: string | null
          pred_status: Database["public"]["Enums"]["tc_status"] | null
          predecessor_status_raw: string | null
          project_id: string
          punchlist_comments: string | null
          r1_status: string | null
          r2_status: string | null
          remarks: string | null
          row_version: number
          source_upload_id: string | null
          subcontractor_name: string | null
          subsub_name: string | null
          subtest_id: string
          system_id: string
          t1_actual_date: string | null
          t1_planned_date: string | null
          t1_status: Database["public"]["Enums"]["tc_status"] | null
          t2_actual_date: string | null
          t2_planned_date: string | null
          t2_status: Database["public"]["Enums"]["tc_status"] | null
          team: Database["public"]["Enums"]["team_type"] | null
          test_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aconex_ref_no?: string | null
          data_source_type?: Database["public"]["Enums"]["data_source"] | null
          description?: string | null
          equipment?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          item_no: string
          level?: string | null
          mos_code: string
          mos_sequence?: number | null
          pred_actual_date?: string | null
          pred_planned_date?: string | null
          pred_status?: Database["public"]["Enums"]["tc_status"] | null
          predecessor_status_raw?: string | null
          project_id: string
          punchlist_comments?: string | null
          r1_status?: string | null
          r2_status?: string | null
          remarks?: string | null
          row_version?: number
          source_upload_id?: string | null
          subcontractor_name?: string | null
          subsub_name?: string | null
          subtest_id: string
          system_id: string
          t1_actual_date?: string | null
          t1_planned_date?: string | null
          t1_status?: Database["public"]["Enums"]["tc_status"] | null
          t2_actual_date?: string | null
          t2_planned_date?: string | null
          t2_status?: Database["public"]["Enums"]["tc_status"] | null
          team?: Database["public"]["Enums"]["team_type"] | null
          test_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aconex_ref_no?: string | null
          data_source_type?: Database["public"]["Enums"]["data_source"] | null
          description?: string | null
          equipment?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          item_no?: string
          level?: string | null
          mos_code?: string
          mos_sequence?: number | null
          pred_actual_date?: string | null
          pred_planned_date?: string | null
          pred_status?: Database["public"]["Enums"]["tc_status"] | null
          predecessor_status_raw?: string | null
          project_id?: string
          punchlist_comments?: string | null
          r1_status?: string | null
          r2_status?: string | null
          remarks?: string | null
          row_version?: number
          source_upload_id?: string | null
          subcontractor_name?: string | null
          subsub_name?: string | null
          subtest_id?: string
          system_id?: string
          t1_actual_date?: string | null
          t1_planned_date?: string | null
          t1_status?: Database["public"]["Enums"]["tc_status"] | null
          t2_actual_date?: string | null
          t2_planned_date?: string | null
          t2_status?: Database["public"]["Enums"]["tc_status"] | null
          team?: Database["public"]["Enums"]["team_type"] | null
          test_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subtests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtests_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "system_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtests_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      system_alias_map: {
        Row: {
          alias_name: string
          created_at: string
          id: string
          is_active: boolean
          project_id: string
          system_id: string
        }
        Insert: {
          alias_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          project_id: string
          system_id: string
        }
        Update: {
          alias_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          project_id?: string
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_alias_map_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_alias_map_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "system_master"
            referencedColumns: ["id"]
          },
        ]
      }
      system_master: {
        Row: {
          auto_created_at: string | null
          auto_created_by: string | null
          created_at: string
          discipline: string | null
          id: string
          is_active: boolean
          is_auto_created: boolean
          project_id: string
          requires_admin_review: boolean
          system_code: string
          system_name_std: string | null
        }
        Insert: {
          auto_created_at?: string | null
          auto_created_by?: string | null
          created_at?: string
          discipline?: string | null
          id?: string
          is_active?: boolean
          is_auto_created?: boolean
          project_id: string
          requires_admin_review?: boolean
          system_code: string
          system_name_std?: string | null
        }
        Update: {
          auto_created_at?: string | null
          auto_created_by?: string | null
          created_at?: string
          discipline?: string | null
          id?: string
          is_active?: boolean
          is_auto_created?: boolean
          project_id?: string
          requires_admin_review?: boolean
          system_code?: string
          system_name_std?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_master_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tests: {
        Row: {
          created_at: string
          description: string | null
          equipment: string | null
          id: string
          is_active: boolean
          item_no: string
          level: string | null
          project_id: string
          source_seed_row_no: number | null
          system_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          equipment?: string | null
          id?: string
          is_active?: boolean
          item_no: string
          level?: string | null
          project_id: string
          source_seed_row_no?: number | null
          system_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          equipment?: string | null
          id?: string
          is_active?: boolean
          item_no?: string
          level?: string | null
          project_id?: string
          source_seed_row_no?: number | null
          system_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tests_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "system_master"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_batches: {
        Row: {
          data_date: string | null
          id: string
          import_type: Database["public"]["Enums"]["import_type"] | null
          note: string | null
          processed_rows: number | null
          project_id: string
          rejected_rows: number | null
          skipped_rows: number | null
          source_type: string | null
          status: Database["public"]["Enums"]["upload_status"]
          success_rows: number | null
          template_version: string | null
          total_rows: number | null
          uploaded_at: string
          uploaded_by: string | null
          uploaded_file_name: string
        }
        Insert: {
          data_date?: string | null
          id?: string
          import_type?: Database["public"]["Enums"]["import_type"] | null
          note?: string | null
          processed_rows?: number | null
          project_id: string
          rejected_rows?: number | null
          skipped_rows?: number | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["upload_status"]
          success_rows?: number | null
          template_version?: string | null
          total_rows?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_file_name: string
        }
        Update: {
          data_date?: string | null
          id?: string
          import_type?: Database["public"]["Enums"]["import_type"] | null
          note?: string | null
          processed_rows?: number | null
          project_id?: string
          rejected_rows?: number | null
          skipped_rows?: number | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["upload_status"]
          success_rows?: number | null
          template_version?: string | null
          total_rows?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_file_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_row_logs: {
        Row: {
          action_taken: Database["public"]["Enums"]["action_taken"] | null
          id: string
          item_no: string | null
          mapped_system_id: string | null
          mos_code: string | null
          processed_at: string
          raw_row_no: number | null
          raw_system_name: string | null
          reason_code: string | null
          reason_detail: string | null
          upload_id: string
        }
        Insert: {
          action_taken?: Database["public"]["Enums"]["action_taken"] | null
          id?: string
          item_no?: string | null
          mapped_system_id?: string | null
          mos_code?: string | null
          processed_at?: string
          raw_row_no?: number | null
          raw_system_name?: string | null
          reason_code?: string | null
          reason_detail?: string | null
          upload_id: string
        }
        Update: {
          action_taken?: Database["public"]["Enums"]["action_taken"] | null
          id?: string
          item_no?: string | null
          mapped_system_id?: string | null
          mos_code?: string | null
          processed_at?: string
          raw_row_no?: number | null
          raw_system_name?: string | null
          reason_code?: string | null
          reason_detail?: string | null
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_row_logs_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "upload_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_system_permissions: {
        Row: {
          can_create_key: boolean
          can_edit: boolean
          can_export: boolean
          can_import: boolean
          can_view: boolean
          granted_at: string
          granted_by: string | null
          id: string
          project_id: string
          system_id: string
          user_id: string
        }
        Insert: {
          can_create_key?: boolean
          can_edit?: boolean
          can_export?: boolean
          can_import?: boolean
          can_view?: boolean
          granted_at?: string
          granted_by?: string | null
          id?: string
          project_id: string
          system_id: string
          user_id: string
        }
        Update: {
          can_create_key?: boolean
          can_edit?: boolean
          can_export?: boolean
          can_import?: boolean
          can_view?: boolean
          granted_at?: string
          granted_by?: string | null
          id?: string
          project_id?: string
          system_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_system_permissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_system_permissions_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "system_master"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_subtest: {
        Args: {
          _project_id: string
          _subcontractor_name: string
          _subsub_name: string
          _system_id: string
          _user_id: string
        }
        Returns: boolean
      }
      can_update_defect: {
        Args: { _defect_id: string; _user_id: string }
        Returns: boolean
      }
      can_update_subtest: {
        Args: { _subtest_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_subtest: {
        Args: {
          _subcontractor_name: string
          _subsub_name: string
          _user_id: string
        }
        Returns: boolean
      }
      delete_defect_import_batch: {
        Args: { _batch_id: string }
        Returns: undefined
      }
      get_defect_edit_scope: {
        Args: { _defect_id: string; _user_id: string }
        Returns: string
      }
      get_subtest_edit_scope: {
        Args: { _subtest_id: string; _user_id: string }
        Returns: string
      }
      get_user_team: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["team_type"]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_system_permission: {
        Args: {
          _permission: string
          _project_id: string
          _system_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_superuser: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      action_taken: "inserted" | "updated" | "skipped" | "rejected"
      app_role:
        | "guest"
        | "super_guest"
        | "user"
        | "senior_user"
        | "superuser"
        | "admin"
      change_source:
        | "app_direct_input"
        | "mobile_input"
        | "excel_import"
        | "admin_edit"
      data_source:
        | "legacy_import_inherited"
        | "app_direct_input"
        | "mobile_input"
        | "standard_import"
        | "admin_edit"
      import_type: "legacy" | "standard"
      tc_status: "Planned" | "WIP" | "Done" | "Hold"
      team_type: "Mech" | "Elec" | "Arch" | "Supp"
      upload_status: "pending" | "processing" | "completed" | "failed"
      user_type: "subcontractor" | "hdec" | "pm_pd" | "admin" | "subsub"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      action_taken: ["inserted", "updated", "skipped", "rejected"],
      app_role: [
        "guest",
        "super_guest",
        "user",
        "senior_user",
        "superuser",
        "admin",
      ],
      change_source: [
        "app_direct_input",
        "mobile_input",
        "excel_import",
        "admin_edit",
      ],
      data_source: [
        "legacy_import_inherited",
        "app_direct_input",
        "mobile_input",
        "standard_import",
        "admin_edit",
      ],
      import_type: ["legacy", "standard"],
      tc_status: ["Planned", "WIP", "Done", "Hold"],
      team_type: ["Mech", "Elec", "Arch", "Supp"],
      upload_status: ["pending", "processing", "completed", "failed"],
      user_type: ["subcontractor", "hdec", "pm_pd", "admin", "subsub"],
    },
  },
} as const
