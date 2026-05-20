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
      code_file_versions: {
        Row: {
          change_summary_ko: string | null
          file_name: string
          id: string
          instruction: string | null
          is_active: boolean
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          change_summary_ko?: string | null
          file_name: string
          id?: string
          instruction?: string | null
          is_active?: boolean
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          change_summary_ko?: string | null
          file_name?: string
          id?: string
          instruction?: string | null
          is_active?: boolean
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      custom_field_definitions: {
        Row: {
          created_at: string
          created_by: string | null
          data_type: string
          display_name: string
          field_name: string
          id: string
          is_active: boolean
          module: string
          note: string | null
          sort_order: number
          sub_module: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_type: string
          display_name: string
          field_name: string
          id?: string
          is_active?: boolean
          module: string
          note?: string | null
          sort_order?: number
          sub_module?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_type?: string
          display_name?: string
          field_name?: string
          id?: string
          is_active?: boolean
          module?: string
          note?: string | null
          sort_order?: number
          sub_module?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      custom_slides: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key: string
          label: string
          spec: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key: string
          label: string
          spec: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key?: string
          label?: string
          spec?: Json
          updated_at?: string
        }
        Relationships: []
      }
      database_snapshots: {
        Row: {
          backup_version: number
          created_at: string
          created_by: string | null
          id: string
          manifest: Json | null
          note: string | null
          row_count: number
          snapshot_data: Json | null
          snapshot_date: string
          snapshot_name: string
          snapshot_type: string
          storage_path: string | null
        }
        Insert: {
          backup_version?: number
          created_at?: string
          created_by?: string | null
          id?: string
          manifest?: Json | null
          note?: string | null
          row_count?: number
          snapshot_data?: Json | null
          snapshot_date?: string
          snapshot_name: string
          snapshot_type?: string
          storage_path?: string | null
        }
        Update: {
          backup_version?: number
          created_at?: string
          created_by?: string | null
          id?: string
          manifest?: Json | null
          note?: string | null
          row_count?: number
          snapshot_data?: Json | null
          snapshot_date?: string
          snapshot_name?: string
          snapshot_type?: string
          storage_path?: string | null
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
      defect_classification_alias: {
        Row: {
          canonical_label: string
          created_at: string
          id: string
          is_active: boolean
          raw_label: string
          updated_at: string
        }
        Insert: {
          canonical_label: string
          created_at?: string
          id?: string
          is_active?: boolean
          raw_label: string
          updated_at?: string
        }
        Update: {
          canonical_label?: string
          created_at?: string
          id?: string
          is_active?: boolean
          raw_label?: string
          updated_at?: string
        }
        Relationships: []
      }
      defect_classification_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          keyword: string
          main_trade: string
          priority: number
          sub_trade: string
          updated_at: string
          work_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          keyword: string
          main_trade: string
          priority?: number
          sub_trade: string
          updated_at?: string
          work_type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string
          main_trade?: string
          priority?: number
          sub_trade?: string
          updated_at?: string
          work_type?: string
        }
        Relationships: []
      }
      defect_comment_reads: {
        Row: {
          defect_id: string
          id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          defect_id: string
          id?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          defect_id?: string
          id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "defect_comment_reads_defect_id_fkey"
            columns: ["defect_id"]
            isOneToOne: false
            referencedRelation: "defect_items"
            referencedColumns: ["id"]
          },
        ]
      }
      defect_comments: {
        Row: {
          author_user_id: string
          created_at: string
          defect_id: string
          edited: boolean
          id: string
          message: string
          parent_comment_id: string | null
          recipients: string[]
          type: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          created_at?: string
          defect_id: string
          edited?: boolean
          id?: string
          message: string
          parent_comment_id?: string | null
          recipients?: string[]
          type?: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          created_at?: string
          defect_id?: string
          edited?: boolean
          id?: string
          message?: string
          parent_comment_id?: string | null
          recipients?: string[]
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "defect_comments_defect_id_fkey"
            columns: ["defect_id"]
            isOneToOne: false
            referencedRelation: "defect_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defect_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "defect_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      defect_daily_snapshots: {
        Row: {
          actual_closure_date: string | null
          actual_completion_date: string | null
          actual_progress_pct: number | null
          closure_status: string | null
          completion_status: string | null
          created_at: string
          created_by: string | null
          defect_id: string
          id: string
          issue_no: string
          planned_closure_date: string | null
          planned_completion_date: string | null
          planned_progress_pct: number | null
          snapshot_date: string
        }
        Insert: {
          actual_closure_date?: string | null
          actual_completion_date?: string | null
          actual_progress_pct?: number | null
          closure_status?: string | null
          completion_status?: string | null
          created_at?: string
          created_by?: string | null
          defect_id: string
          id?: string
          issue_no: string
          planned_closure_date?: string | null
          planned_completion_date?: string | null
          planned_progress_pct?: number | null
          snapshot_date?: string
        }
        Update: {
          actual_closure_date?: string | null
          actual_completion_date?: string | null
          actual_progress_pct?: number | null
          closure_status?: string | null
          completion_status?: string | null
          created_at?: string
          created_by?: string | null
          defect_id?: string
          id?: string
          issue_no?: string
          planned_closure_date?: string | null
          planned_completion_date?: string | null
          planned_progress_pct?: number | null
          snapshot_date?: string
        }
        Relationships: []
      }
      defect_discipline_fallback: {
        Row: {
          created_at: string
          field_discipline: string
          id: string
          is_active: boolean
          main_trade: string
          sub_trade: string
          updated_at: string
          work_type: string
        }
        Insert: {
          created_at?: string
          field_discipline: string
          id?: string
          is_active?: boolean
          main_trade: string
          sub_trade: string
          updated_at?: string
          work_type: string
        }
        Update: {
          created_at?: string
          field_discipline?: string
          id?: string
          is_active?: boolean
          main_trade?: string
          sub_trade?: string
          updated_at?: string
          work_type?: string
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
          aconex_comments: string | null
          actual_closure_date: string | null
          actual_completion_date: string | null
          actual_progress_pct: number | null
          actual_start_date: string | null
          area_level: string | null
          area_location: string | null
          area_raw: string | null
          area_type: string | null
          classification_source: string | null
          classified_at: string | null
          closure_status: string | null
          completion_status: string | null
          created_at: string
          critical_marked_at: string | null
          critical_marked_by: string | null
          critical_marked_by_name: string | null
          custom_payload: Json
          data_source_type: string | null
          defect_type: string | null
          description: string | null
          hdec_comments: string | null
          hdec_eng_name: string | null
          hdec_pic_name: string | null
          id: string
          is_active: boolean
          is_critical: boolean
          issue_no: string
          main_trade: string | null
          planned_closure_date: string | null
          planned_completion_date: string | null
          planned_progress_pct: number | null
          planned_start_date: string | null
          priority: string | null
          project_id: string
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
          team: Database["public"]["Enums"]["team_type"] | null
          trade_detail: string | null
          updated_at: string
          updated_by: string | null
          work_type: string | null
        }
        Insert: {
          aconex_comments?: string | null
          actual_closure_date?: string | null
          actual_completion_date?: string | null
          actual_progress_pct?: number | null
          actual_start_date?: string | null
          area_level?: string | null
          area_location?: string | null
          area_raw?: string | null
          area_type?: string | null
          classification_source?: string | null
          classified_at?: string | null
          closure_status?: string | null
          completion_status?: string | null
          created_at?: string
          critical_marked_at?: string | null
          critical_marked_by?: string | null
          critical_marked_by_name?: string | null
          custom_payload?: Json
          data_source_type?: string | null
          defect_type?: string | null
          description?: string | null
          hdec_comments?: string | null
          hdec_eng_name?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          is_critical?: boolean
          issue_no: string
          main_trade?: string | null
          planned_closure_date?: string | null
          planned_completion_date?: string | null
          planned_progress_pct?: number | null
          planned_start_date?: string | null
          priority?: string | null
          project_id: string
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
          team?: Database["public"]["Enums"]["team_type"] | null
          trade_detail?: string | null
          updated_at?: string
          updated_by?: string | null
          work_type?: string | null
        }
        Update: {
          aconex_comments?: string | null
          actual_closure_date?: string | null
          actual_completion_date?: string | null
          actual_progress_pct?: number | null
          actual_start_date?: string | null
          area_level?: string | null
          area_location?: string | null
          area_raw?: string | null
          area_type?: string | null
          classification_source?: string | null
          classified_at?: string | null
          closure_status?: string | null
          completion_status?: string | null
          created_at?: string
          critical_marked_at?: string | null
          critical_marked_by?: string | null
          critical_marked_by_name?: string | null
          custom_payload?: Json
          data_source_type?: string | null
          defect_type?: string | null
          description?: string | null
          hdec_comments?: string | null
          hdec_eng_name?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          is_critical?: boolean
          issue_no?: string
          main_trade?: string | null
          planned_closure_date?: string | null
          planned_completion_date?: string | null
          planned_progress_pct?: number | null
          planned_start_date?: string | null
          priority?: string | null
          project_id?: string
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
          team?: Database["public"]["Enums"]["team_type"] | null
          trade_detail?: string | null
          updated_at?: string
          updated_by?: string | null
          work_type?: string | null
        }
        Relationships: []
      }
      defect_schedule_change_audit: {
        Row: {
          actual_closure_diff_days: number | null
          actual_closure_new_date: string | null
          actual_closure_old_date: string | null
          actual_completion_diff_days: number | null
          actual_completion_new_date: string | null
          actual_completion_old_date: string | null
          actual_start_diff_days: number | null
          actual_start_new_date: string | null
          actual_start_old_date: string | null
          change_source: string | null
          closure_status_new: string | null
          closure_status_old: string | null
          completion_status_new: string | null
          completion_status_old: string | null
          created_at: string
          created_by: string | null
          defect_id: string
          id: string
          issue_no: string
          planned_closure_diff_days: number | null
          planned_closure_new_date: string | null
          planned_closure_old_date: string | null
          planned_completion_diff_days: number | null
          planned_completion_new_date: string | null
          planned_completion_old_date: string | null
          planned_progress_diff_pct: number | null
          planned_progress_new_pct: number | null
          planned_progress_old_pct: number | null
          planned_start_diff_days: number | null
          planned_start_new_date: string | null
          planned_start_old_date: string | null
          progress_diff_pct: number | null
          progress_new_pct: number | null
          progress_old_pct: number | null
          project_id: string | null
          raw_row_no: number | null
          subcontractor_issue_no: string | null
          upload_id: string | null
        }
        Insert: {
          actual_closure_diff_days?: number | null
          actual_closure_new_date?: string | null
          actual_closure_old_date?: string | null
          actual_completion_diff_days?: number | null
          actual_completion_new_date?: string | null
          actual_completion_old_date?: string | null
          actual_start_diff_days?: number | null
          actual_start_new_date?: string | null
          actual_start_old_date?: string | null
          change_source?: string | null
          closure_status_new?: string | null
          closure_status_old?: string | null
          completion_status_new?: string | null
          completion_status_old?: string | null
          created_at?: string
          created_by?: string | null
          defect_id: string
          id?: string
          issue_no: string
          planned_closure_diff_days?: number | null
          planned_closure_new_date?: string | null
          planned_closure_old_date?: string | null
          planned_completion_diff_days?: number | null
          planned_completion_new_date?: string | null
          planned_completion_old_date?: string | null
          planned_progress_diff_pct?: number | null
          planned_progress_new_pct?: number | null
          planned_progress_old_pct?: number | null
          planned_start_diff_days?: number | null
          planned_start_new_date?: string | null
          planned_start_old_date?: string | null
          progress_diff_pct?: number | null
          progress_new_pct?: number | null
          progress_old_pct?: number | null
          project_id?: string | null
          raw_row_no?: number | null
          subcontractor_issue_no?: string | null
          upload_id?: string | null
        }
        Update: {
          actual_closure_diff_days?: number | null
          actual_closure_new_date?: string | null
          actual_closure_old_date?: string | null
          actual_completion_diff_days?: number | null
          actual_completion_new_date?: string | null
          actual_completion_old_date?: string | null
          actual_start_diff_days?: number | null
          actual_start_new_date?: string | null
          actual_start_old_date?: string | null
          change_source?: string | null
          closure_status_new?: string | null
          closure_status_old?: string | null
          completion_status_new?: string | null
          completion_status_old?: string | null
          created_at?: string
          created_by?: string | null
          defect_id?: string
          id?: string
          issue_no?: string
          planned_closure_diff_days?: number | null
          planned_closure_new_date?: string | null
          planned_closure_old_date?: string | null
          planned_completion_diff_days?: number | null
          planned_completion_new_date?: string | null
          planned_completion_old_date?: string | null
          planned_progress_diff_pct?: number | null
          planned_progress_new_pct?: number | null
          planned_progress_old_pct?: number | null
          planned_start_diff_days?: number | null
          planned_start_new_date?: string | null
          planned_start_old_date?: string | null
          progress_diff_pct?: number | null
          progress_new_pct?: number | null
          progress_old_pct?: number | null
          project_id?: string | null
          raw_row_no?: number | null
          subcontractor_issue_no?: string | null
          upload_id?: string | null
        }
        Relationships: []
      }
      defect_subcontractor_workscope: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          keywords: string[]
          label: string
          match_priority: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          label: string
          match_priority?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          label?: string
          match_priority?: number
          updated_at?: string
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
          rollback_force: boolean | null
          rolled_back_at: string | null
          rolled_back_by: string | null
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
          rollback_force?: boolean | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
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
          rollback_force?: boolean | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
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
      defect_work_types: {
        Row: {
          created_at: string
          default_main_trade: string | null
          default_sub_trade: string | null
          desc_keywords: string[]
          id: string
          is_active: boolean
          match_order: number
          name: string
          sub_match: string[]
          trade: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_main_trade?: string | null
          default_sub_trade?: string | null
          desc_keywords?: string[]
          id?: string
          is_active?: boolean
          match_order?: number
          name: string
          sub_match?: string[]
          trade: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_main_trade?: string | null
          default_sub_trade?: string | null
          desc_keywords?: string[]
          id?: string
          is_active?: boolean
          match_order?: number
          name?: string
          sub_match?: string[]
          trade?: string
          updated_at?: string
        }
        Relationships: []
      }
      design_guide_versions: {
        Row: {
          id: string
          is_active: boolean
          public_url: string | null
          storage_path: string
          summary_ko: string | null
          tokens_snapshot: Json
          uploaded_at: string
          uploaded_by: string | null
          version_label: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean
          public_url?: string | null
          storage_path: string
          summary_ko?: string | null
          tokens_snapshot: Json
          uploaded_at?: string
          uploaded_by?: string | null
          version_label?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean
          public_url?: string | null
          storage_path?: string
          summary_ko?: string | null
          tokens_snapshot?: Json
          uploaded_at?: string
          uploaded_by?: string | null
          version_label?: string | null
        }
        Relationships: []
      }
      design_tokens: {
        Row: {
          category: string
          created_at: string
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      docs_change_log: {
        Row: {
          change_source: string | null
          changed_at: string
          changed_by: string | null
          changed_field: string
          drawing_id: string | null
          id: string
          new_value: string | null
          old_value: string | null
          record_id: string | null
          sub_module: string
          upload_id: string | null
        }
        Insert: {
          change_source?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_field: string
          drawing_id?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id?: string | null
          sub_module?: string
          upload_id?: string | null
        }
        Update: {
          change_source?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_field?: string
          drawing_id?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id?: string | null
          sub_module?: string
          upload_id?: string | null
        }
        Relationships: []
      }
      docs_drawings: {
        Row: {
          aconex_status: string | null
          approved_date: string | null
          created_at: string
          current_status: string | null
          custom_payload: Json
          data_source_type: string | null
          days_due: number | null
          discipline: string | null
          document_no: string
          document_type: string | null
          hdec_eng_name: string | null
          hdec_pic_name: string | null
          id: string
          is_active: boolean
          is_submitted: boolean
          level_location: string | null
          organisation_raw: string | null
          project_id: string
          raw_payload: Json
          remarks: string | null
          revision: string | null
          row_no: number | null
          row_version: number
          sequential_no: string | null
          series: string | null
          sheet_name: string | null
          source_upload_id: string | null
          sub_module: string
          sub1_actual_response_date: string | null
          sub1_approval_date: string | null
          sub1_approval_status: string | null
          sub1_planned_date: string | null
          sub1_submission_date: string | null
          sub2_actual_response_date: string | null
          sub2_approval_date: string | null
          sub2_approval_status: string | null
          sub2_planned_date: string | null
          sub2_submission_date: string | null
          sub3_actual_response_date: string | null
          sub3_approval_date: string | null
          sub3_approval_status: string | null
          sub3_planned_date: string | null
          sub3_submission_date: string | null
          subcontractor_id: string | null
          subcontractor_name: string | null
          submitted_date: string | null
          team: Database["public"]["Enums"]["team_type"] | null
          title: string | null
          trade: string | null
          transmittal_due_date: string | null
          transmittal_number: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aconex_status?: string | null
          approved_date?: string | null
          created_at?: string
          current_status?: string | null
          custom_payload?: Json
          data_source_type?: string | null
          days_due?: number | null
          discipline?: string | null
          document_no: string
          document_type?: string | null
          hdec_eng_name?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          is_submitted?: boolean
          level_location?: string | null
          organisation_raw?: string | null
          project_id: string
          raw_payload?: Json
          remarks?: string | null
          revision?: string | null
          row_no?: number | null
          row_version?: number
          sequential_no?: string | null
          series?: string | null
          sheet_name?: string | null
          source_upload_id?: string | null
          sub_module?: string
          sub1_actual_response_date?: string | null
          sub1_approval_date?: string | null
          sub1_approval_status?: string | null
          sub1_planned_date?: string | null
          sub1_submission_date?: string | null
          sub2_actual_response_date?: string | null
          sub2_approval_date?: string | null
          sub2_approval_status?: string | null
          sub2_planned_date?: string | null
          sub2_submission_date?: string | null
          sub3_actual_response_date?: string | null
          sub3_approval_date?: string | null
          sub3_approval_status?: string | null
          sub3_planned_date?: string | null
          sub3_submission_date?: string | null
          subcontractor_id?: string | null
          subcontractor_name?: string | null
          submitted_date?: string | null
          team?: Database["public"]["Enums"]["team_type"] | null
          title?: string | null
          trade?: string | null
          transmittal_due_date?: string | null
          transmittal_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aconex_status?: string | null
          approved_date?: string | null
          created_at?: string
          current_status?: string | null
          custom_payload?: Json
          data_source_type?: string | null
          days_due?: number | null
          discipline?: string | null
          document_no?: string
          document_type?: string | null
          hdec_eng_name?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          is_submitted?: boolean
          level_location?: string | null
          organisation_raw?: string | null
          project_id?: string
          raw_payload?: Json
          remarks?: string | null
          revision?: string | null
          row_no?: number | null
          row_version?: number
          sequential_no?: string | null
          series?: string | null
          sheet_name?: string | null
          source_upload_id?: string | null
          sub_module?: string
          sub1_actual_response_date?: string | null
          sub1_approval_date?: string | null
          sub1_approval_status?: string | null
          sub1_planned_date?: string | null
          sub1_submission_date?: string | null
          sub2_actual_response_date?: string | null
          sub2_approval_date?: string | null
          sub2_approval_status?: string | null
          sub2_planned_date?: string | null
          sub2_submission_date?: string | null
          sub3_actual_response_date?: string | null
          sub3_approval_date?: string | null
          sub3_approval_status?: string | null
          sub3_planned_date?: string | null
          sub3_submission_date?: string | null
          subcontractor_id?: string | null
          subcontractor_name?: string | null
          submitted_date?: string | null
          team?: Database["public"]["Enums"]["team_type"] | null
          title?: string | null
          trade?: string | null
          transmittal_due_date?: string | null
          transmittal_number?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      docs_field_config: {
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
          sub_module: string
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
          sub_module?: string
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
          sub_module?: string
          visible_to_roles?: Database["public"]["Enums"]["app_role"][] | null
        }
        Relationships: []
      }
      docs_omm: {
        Row: {
          category: string | null
          category_group: string | null
          created_at: string
          current_stage: string | null
          current_status: string | null
          custom_payload: Json
          data_source_type: string | null
          draft_actual_date: string | null
          draft_planned_date: string | null
          draft_response_date: string | null
          draft_response_status: string | null
          final_actual_date: string | null
          final_planned_date: string | null
          final_response_actual_date: string | null
          final_response_planned_date: string | null
          final_response_status: string | null
          hardcopy_actual_qty: number | null
          hardcopy_required_qty: number | null
          hdec_eng_name: string | null
          hdec_pic_name: string | null
          id: string
          instruction_date: string | null
          is_active: boolean
          is_resubmission: boolean
          parent_id: string | null
          pdf_actual_qty: number | null
          pdf_required_qty: number | null
          project_id: string
          raw_payload: Json
          remarks: string | null
          resubmission_seq: number
          row_no: number | null
          row_version: number
          section: string | null
          sheet_name: string | null
          sn: string | null
          source_upload_id: string | null
          sub1_actual_date: string | null
          sub1_planned_date: string | null
          sub1_response_date: string | null
          sub1_response_status: string | null
          sub2_actual_date: string | null
          sub2_planned_date: string | null
          sub2_response_actual_date: string | null
          sub2_response_planned_date: string | null
          sub2_response_status: string | null
          sub3_actual_date: string | null
          sub3_planned_date: string | null
          sub3_response_actual_date: string | null
          sub3_response_planned_date: string | null
          sub3_response_status: string | null
          subcontractor_id: string | null
          subcontractor_name: string | null
          team: Database["public"]["Enums"]["team_type"] | null
          trade: string | null
          training_required: string | null
          updated_at: string
          updated_by: string | null
          work_trade_material: string | null
        }
        Insert: {
          category?: string | null
          category_group?: string | null
          created_at?: string
          current_stage?: string | null
          current_status?: string | null
          custom_payload?: Json
          data_source_type?: string | null
          draft_actual_date?: string | null
          draft_planned_date?: string | null
          draft_response_date?: string | null
          draft_response_status?: string | null
          final_actual_date?: string | null
          final_planned_date?: string | null
          final_response_actual_date?: string | null
          final_response_planned_date?: string | null
          final_response_status?: string | null
          hardcopy_actual_qty?: number | null
          hardcopy_required_qty?: number | null
          hdec_eng_name?: string | null
          hdec_pic_name?: string | null
          id?: string
          instruction_date?: string | null
          is_active?: boolean
          is_resubmission?: boolean
          parent_id?: string | null
          pdf_actual_qty?: number | null
          pdf_required_qty?: number | null
          project_id: string
          raw_payload?: Json
          remarks?: string | null
          resubmission_seq?: number
          row_no?: number | null
          row_version?: number
          section?: string | null
          sheet_name?: string | null
          sn?: string | null
          source_upload_id?: string | null
          sub1_actual_date?: string | null
          sub1_planned_date?: string | null
          sub1_response_date?: string | null
          sub1_response_status?: string | null
          sub2_actual_date?: string | null
          sub2_planned_date?: string | null
          sub2_response_actual_date?: string | null
          sub2_response_planned_date?: string | null
          sub2_response_status?: string | null
          sub3_actual_date?: string | null
          sub3_planned_date?: string | null
          sub3_response_actual_date?: string | null
          sub3_response_planned_date?: string | null
          sub3_response_status?: string | null
          subcontractor_id?: string | null
          subcontractor_name?: string | null
          team?: Database["public"]["Enums"]["team_type"] | null
          trade?: string | null
          training_required?: string | null
          updated_at?: string
          updated_by?: string | null
          work_trade_material?: string | null
        }
        Update: {
          category?: string | null
          category_group?: string | null
          created_at?: string
          current_stage?: string | null
          current_status?: string | null
          custom_payload?: Json
          data_source_type?: string | null
          draft_actual_date?: string | null
          draft_planned_date?: string | null
          draft_response_date?: string | null
          draft_response_status?: string | null
          final_actual_date?: string | null
          final_planned_date?: string | null
          final_response_actual_date?: string | null
          final_response_planned_date?: string | null
          final_response_status?: string | null
          hardcopy_actual_qty?: number | null
          hardcopy_required_qty?: number | null
          hdec_eng_name?: string | null
          hdec_pic_name?: string | null
          id?: string
          instruction_date?: string | null
          is_active?: boolean
          is_resubmission?: boolean
          parent_id?: string | null
          pdf_actual_qty?: number | null
          pdf_required_qty?: number | null
          project_id?: string
          raw_payload?: Json
          remarks?: string | null
          resubmission_seq?: number
          row_no?: number | null
          row_version?: number
          section?: string | null
          sheet_name?: string | null
          sn?: string | null
          source_upload_id?: string | null
          sub1_actual_date?: string | null
          sub1_planned_date?: string | null
          sub1_response_date?: string | null
          sub1_response_status?: string | null
          sub2_actual_date?: string | null
          sub2_planned_date?: string | null
          sub2_response_actual_date?: string | null
          sub2_response_planned_date?: string | null
          sub2_response_status?: string | null
          sub3_actual_date?: string | null
          sub3_planned_date?: string | null
          sub3_response_actual_date?: string | null
          sub3_response_planned_date?: string | null
          sub3_response_status?: string | null
          subcontractor_id?: string | null
          subcontractor_name?: string | null
          team?: Database["public"]["Enums"]["team_type"] | null
          trade?: string | null
          training_required?: string | null
          updated_at?: string
          updated_by?: string | null
          work_trade_material?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "docs_omm_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "docs_omm"
            referencedColumns: ["id"]
          },
        ]
      }
      docs_org_alias: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          raw_label: string
          subcontractor_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          raw_label: string
          subcontractor_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          raw_label?: string
          subcontractor_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      docs_spare_part: {
        Row: {
          actual_confirm_date: string | null
          actual_delivery_date: string | null
          actual_po_date: string | null
          category: string | null
          created_at: string
          custom_payload: Json
          data_source_type: string | null
          direction_to_subcon_date: string | null
          eta_date: string | null
          floor_level: string | null
          hdec_eng_name: string | null
          hdec_pic_name: string | null
          id: string
          is_active: boolean
          item_no: number | null
          item_type: string | null
          level: string | null
          location: string | null
          material: string | null
          material_lead_time: string | null
          parent_item: string | null
          planned_confirm_date: string | null
          planned_delivery_date: string | null
          planned_po_date: string | null
          po_status: string | null
          project_id: string
          raw_payload: Json
          remarks: string | null
          row_no: number | null
          row_version: number
          sheet_name: string | null
          size: string | null
          sn: string | null
          sn_outline: string | null
          source_upload_id: string | null
          spares_quantity: string | null
          spares_requirements: string | null
          spec_ref: string | null
          specification: string | null
          status: string | null
          storage_area_required: string | null
          sub_category: string | null
          subcontractor_name: string | null
          team: Database["public"]["Enums"]["team_type"] | null
          trade: string | null
          unit: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_confirm_date?: string | null
          actual_delivery_date?: string | null
          actual_po_date?: string | null
          category?: string | null
          created_at?: string
          custom_payload?: Json
          data_source_type?: string | null
          direction_to_subcon_date?: string | null
          eta_date?: string | null
          floor_level?: string | null
          hdec_eng_name?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          item_no?: number | null
          item_type?: string | null
          level?: string | null
          location?: string | null
          material?: string | null
          material_lead_time?: string | null
          parent_item?: string | null
          planned_confirm_date?: string | null
          planned_delivery_date?: string | null
          planned_po_date?: string | null
          po_status?: string | null
          project_id: string
          raw_payload?: Json
          remarks?: string | null
          row_no?: number | null
          row_version?: number
          sheet_name?: string | null
          size?: string | null
          sn?: string | null
          sn_outline?: string | null
          source_upload_id?: string | null
          spares_quantity?: string | null
          spares_requirements?: string | null
          spec_ref?: string | null
          specification?: string | null
          status?: string | null
          storage_area_required?: string | null
          sub_category?: string | null
          subcontractor_name?: string | null
          team?: Database["public"]["Enums"]["team_type"] | null
          trade?: string | null
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_confirm_date?: string | null
          actual_delivery_date?: string | null
          actual_po_date?: string | null
          category?: string | null
          created_at?: string
          custom_payload?: Json
          data_source_type?: string | null
          direction_to_subcon_date?: string | null
          eta_date?: string | null
          floor_level?: string | null
          hdec_eng_name?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          item_no?: number | null
          item_type?: string | null
          level?: string | null
          location?: string | null
          material?: string | null
          material_lead_time?: string | null
          parent_item?: string | null
          planned_confirm_date?: string | null
          planned_delivery_date?: string | null
          planned_po_date?: string | null
          po_status?: string | null
          project_id?: string
          raw_payload?: Json
          remarks?: string | null
          row_no?: number | null
          row_version?: number
          sheet_name?: string | null
          size?: string | null
          sn?: string | null
          sn_outline?: string | null
          source_upload_id?: string | null
          spares_quantity?: string | null
          spares_requirements?: string | null
          spec_ref?: string | null
          specification?: string | null
          status?: string | null
          storage_area_required?: string | null
          sub_category?: string | null
          subcontractor_name?: string | null
          team?: Database["public"]["Enums"]["team_type"] | null
          trade?: string | null
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      docs_upload_batches: {
        Row: {
          data_date: string | null
          id: string
          note: string | null
          processed_rows: number | null
          project_id: string | null
          rejected_rows: number | null
          rollback_force: boolean | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          skipped_rows: number | null
          status: Database["public"]["Enums"]["upload_status"]
          sub_module: string
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
          rollback_force?: boolean | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          skipped_rows?: number | null
          status?: Database["public"]["Enums"]["upload_status"]
          sub_module?: string
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
          rollback_force?: boolean | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          skipped_rows?: number | null
          status?: Database["public"]["Enums"]["upload_status"]
          sub_module?: string
          success_rows?: number | null
          total_rows?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_file_name?: string
        }
        Relationships: []
      }
      docs_upload_row_logs: {
        Row: {
          action_taken: Database["public"]["Enums"]["action_taken"] | null
          document_no: string | null
          id: string
          processed_at: string
          raw_row_no: number | null
          reason_code: string | null
          reason_detail: string | null
          upload_id: string
        }
        Insert: {
          action_taken?: Database["public"]["Enums"]["action_taken"] | null
          document_no?: string | null
          id?: string
          processed_at?: string
          raw_row_no?: number | null
          reason_code?: string | null
          reason_detail?: string | null
          upload_id: string
        }
        Update: {
          action_taken?: Database["public"]["Enums"]["action_taken"] | null
          document_no?: string | null
          id?: string
          processed_at?: string
          raw_row_no?: number | null
          reason_code?: string | null
          reason_detail?: string | null
          upload_id?: string
        }
        Relationships: []
      }
      event_log: {
        Row: {
          action: string
          actor_login_id: string | null
          actor_name: string | null
          actor_role: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          changed_fields: string[]
          id: string
          occurred_at: string
          record_id: string | null
          summary: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_login_id?: string | null
          actor_name?: string | null
          actor_role: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          changed_fields?: string[]
          id?: string
          occurred_at?: string
          record_id?: string | null
          summary?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_login_id?: string | null
          actor_name?: string | null
          actor_role?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          changed_fields?: string[]
          id?: string
          occurred_at?: string
          record_id?: string | null
          summary?: string | null
          table_name?: string
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
      font_registry: {
        Row: {
          created_at: string
          family_name: string
          file_size_bytes: number
          id: string
          is_default: boolean
          language: string
          public_url: string
          storage_path: string
          style: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          family_name: string
          file_size_bytes?: number
          id?: string
          is_default?: boolean
          language?: string
          public_url: string
          storage_path: string
          style?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          family_name?: string
          file_size_bytes?: number
          id?: string
          is_default?: boolean
          language?: string
          public_url?: string
          storage_path?: string
          style?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      hdec_eng_master: {
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
      import_field_logs: {
        Row: {
          applied_value: string | null
          created_at: string
          created_by: string | null
          field_name: string
          id: string
          kind: string
          outcome: string
          previous_value: string | null
          raw_row_no: number | null
          raw_value: string | null
          reason_code: string | null
          reason_detail: string | null
          row_log_id: string | null
          upload_id: string
        }
        Insert: {
          applied_value?: string | null
          created_at?: string
          created_by?: string | null
          field_name: string
          id?: string
          kind: string
          outcome: string
          previous_value?: string | null
          raw_row_no?: number | null
          raw_value?: string | null
          reason_code?: string | null
          reason_detail?: string | null
          row_log_id?: string | null
          upload_id: string
        }
        Update: {
          applied_value?: string | null
          created_at?: string
          created_by?: string | null
          field_name?: string
          id?: string
          kind?: string
          outcome?: string
          previous_value?: string | null
          raw_row_no?: number | null
          raw_value?: string | null
          reason_code?: string | null
          reason_detail?: string | null
          row_log_id?: string | null
          upload_id?: string
        }
        Relationships: []
      }
      import_header_mappings: {
        Row: {
          created_at: string
          header_alias: string
          id: string
          is_active: boolean
          is_system: boolean
          module: string
          note: string | null
          sub_module: string | null
          target_field: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          header_alias: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          module: string
          note?: string | null
          sub_module?: string | null
          target_field: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          header_alias?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          module?: string
          note?: string | null
          sub_module?: string | null
          target_field?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      omm_comment_reads: {
        Row: {
          id: string
          last_read_at: string
          omm_id: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          omm_id: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          omm_id?: string
          user_id?: string
        }
        Relationships: []
      }
      omm_comments: {
        Row: {
          author_user_id: string
          created_at: string
          edited: boolean
          id: string
          message: string
          omm_id: string
          parent_comment_id: string | null
          recipients: string[]
          type: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          created_at?: string
          edited?: boolean
          id?: string
          message: string
          omm_id: string
          parent_comment_id?: string | null
          recipients?: string[]
          type?: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          created_at?: string
          edited?: boolean
          id?: string
          message?: string
          omm_id?: string
          parent_comment_id?: string | null
          recipients?: string[]
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "omm_comments_omm_id_fkey"
            columns: ["omm_id"]
            isOneToOne: false
            referencedRelation: "docs_omm"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "omm_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "omm_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      ppt_slide_config: {
        Row: {
          created_at: string
          id: string
          slides: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          slides?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          slides?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          hdec_eng_name: string | null
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
          hdec_eng_name?: string | null
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
          hdec_eng_name?: string | null
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
      punch_change_log: {
        Row: {
          change_source: string | null
          changed_at: string
          changed_by: string | null
          changed_field: string
          id: string
          new_value: string | null
          old_value: string | null
          punch_id: string
          upload_id: string | null
        }
        Insert: {
          change_source?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          punch_id: string
          upload_id?: string | null
        }
        Update: {
          change_source?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          punch_id?: string
          upload_id?: string | null
        }
        Relationships: []
      }
      punch_comment_reads: {
        Row: {
          id: string
          last_read_at: string
          punch_id: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          punch_id: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          punch_id?: string
          user_id?: string
        }
        Relationships: []
      }
      punch_comments: {
        Row: {
          author_user_id: string
          created_at: string
          edited: boolean
          id: string
          message: string
          parent_comment_id: string | null
          punch_id: string
          recipients: string[]
          type: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          created_at?: string
          edited?: boolean
          id?: string
          message: string
          parent_comment_id?: string | null
          punch_id: string
          recipients?: string[]
          type?: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          created_at?: string
          edited?: boolean
          id?: string
          message?: string
          parent_comment_id?: string | null
          punch_id?: string
          recipients?: string[]
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      punch_daily_snapshots: {
        Row: {
          actual_progress_pct: number | null
          completion_status: string | null
          created_at: string
          created_by: string | null
          health_status:
            | Database["public"]["Enums"]["punch_health_status"]
            | null
          id: string
          planned_progress_pct: number | null
          pre_engineering_ready: boolean | null
          punch_id: string
          snapshot_date: string
          variance_pct: number | null
        }
        Insert: {
          actual_progress_pct?: number | null
          completion_status?: string | null
          created_at?: string
          created_by?: string | null
          health_status?:
            | Database["public"]["Enums"]["punch_health_status"]
            | null
          id?: string
          planned_progress_pct?: number | null
          pre_engineering_ready?: boolean | null
          punch_id: string
          snapshot_date?: string
          variance_pct?: number | null
        }
        Update: {
          actual_progress_pct?: number | null
          completion_status?: string | null
          created_at?: string
          created_by?: string | null
          health_status?:
            | Database["public"]["Enums"]["punch_health_status"]
            | null
          id?: string
          planned_progress_pct?: number | null
          pre_engineering_ready?: boolean | null
          punch_id?: string
          snapshot_date?: string
          variance_pct?: number | null
        }
        Relationships: []
      }
      punch_field_config: {
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
      punch_items: {
        Row: {
          actual_completion_date: string | null
          actual_progress_pct: number | null
          actual_start_date: string | null
          category1: string | null
          category2: string | null
          category3: string | null
          completion_status: string | null
          created_at: string
          critical_level: string | null
          custom_payload: Json
          data_date: string | null
          data_source_type: string | null
          drawing_approval_date: string | null
          drawing_approval_status: Database["public"]["Enums"]["punch_gate_status"]
          hdec_eng_name: string | null
          hdec_pic_name: string | null
          health_status:
            | Database["public"]["Enums"]["punch_health_status"]
            | null
          id: string
          is_active: boolean
          item_no: string | null
          level: string | null
          location: string | null
          main_trade: string | null
          material_approval_date: string | null
          material_approval_status: Database["public"]["Enums"]["punch_gate_status"]
          material_procurement_date: string | null
          material_procurement_status: Database["public"]["Enums"]["punch_procurement_status"]
          mos_approval_date: string | null
          mos_approval_status: Database["public"]["Enums"]["punch_gate_status"]
          outstanding_work: string
          planned_completion_date: string | null
          planned_progress_pct: number | null
          planned_start_date: string | null
          pre_engineering_blockers: string[]
          pre_engineering_ready: boolean
          progress_variance_pct: number | null
          project_id: string
          raw_payload: Json
          remarks: string | null
          row_version: number
          source_upload_id: string | null
          sub_trade: string | null
          subcontractor_name: string | null
          subsub_name: string | null
          team: Database["public"]["Enums"]["team_type"] | null
          updated_at: string
          updated_by: string | null
          weight: number
          work_type: string | null
        }
        Insert: {
          actual_completion_date?: string | null
          actual_progress_pct?: number | null
          actual_start_date?: string | null
          category1?: string | null
          category2?: string | null
          category3?: string | null
          completion_status?: string | null
          created_at?: string
          critical_level?: string | null
          custom_payload?: Json
          data_date?: string | null
          data_source_type?: string | null
          drawing_approval_date?: string | null
          drawing_approval_status?: Database["public"]["Enums"]["punch_gate_status"]
          hdec_eng_name?: string | null
          hdec_pic_name?: string | null
          health_status?:
            | Database["public"]["Enums"]["punch_health_status"]
            | null
          id?: string
          is_active?: boolean
          item_no?: string | null
          level?: string | null
          location?: string | null
          main_trade?: string | null
          material_approval_date?: string | null
          material_approval_status?: Database["public"]["Enums"]["punch_gate_status"]
          material_procurement_date?: string | null
          material_procurement_status?: Database["public"]["Enums"]["punch_procurement_status"]
          mos_approval_date?: string | null
          mos_approval_status?: Database["public"]["Enums"]["punch_gate_status"]
          outstanding_work: string
          planned_completion_date?: string | null
          planned_progress_pct?: number | null
          planned_start_date?: string | null
          pre_engineering_blockers?: string[]
          pre_engineering_ready?: boolean
          progress_variance_pct?: number | null
          project_id: string
          raw_payload?: Json
          remarks?: string | null
          row_version?: number
          source_upload_id?: string | null
          sub_trade?: string | null
          subcontractor_name?: string | null
          subsub_name?: string | null
          team?: Database["public"]["Enums"]["team_type"] | null
          updated_at?: string
          updated_by?: string | null
          weight?: number
          work_type?: string | null
        }
        Update: {
          actual_completion_date?: string | null
          actual_progress_pct?: number | null
          actual_start_date?: string | null
          category1?: string | null
          category2?: string | null
          category3?: string | null
          completion_status?: string | null
          created_at?: string
          critical_level?: string | null
          custom_payload?: Json
          data_date?: string | null
          data_source_type?: string | null
          drawing_approval_date?: string | null
          drawing_approval_status?: Database["public"]["Enums"]["punch_gate_status"]
          hdec_eng_name?: string | null
          hdec_pic_name?: string | null
          health_status?:
            | Database["public"]["Enums"]["punch_health_status"]
            | null
          id?: string
          is_active?: boolean
          item_no?: string | null
          level?: string | null
          location?: string | null
          main_trade?: string | null
          material_approval_date?: string | null
          material_approval_status?: Database["public"]["Enums"]["punch_gate_status"]
          material_procurement_date?: string | null
          material_procurement_status?: Database["public"]["Enums"]["punch_procurement_status"]
          mos_approval_date?: string | null
          mos_approval_status?: Database["public"]["Enums"]["punch_gate_status"]
          outstanding_work?: string
          planned_completion_date?: string | null
          planned_progress_pct?: number | null
          planned_start_date?: string | null
          pre_engineering_blockers?: string[]
          pre_engineering_ready?: boolean
          progress_variance_pct?: number | null
          project_id?: string
          raw_payload?: Json
          remarks?: string | null
          row_version?: number
          source_upload_id?: string | null
          sub_trade?: string | null
          subcontractor_name?: string | null
          subsub_name?: string | null
          team?: Database["public"]["Enums"]["team_type"] | null
          updated_at?: string
          updated_by?: string | null
          weight?: number
          work_type?: string | null
        }
        Relationships: []
      }
      punch_upload_batches: {
        Row: {
          data_date: string | null
          id: string
          note: string | null
          processed_rows: number | null
          project_id: string | null
          rejected_rows: number | null
          rollback_force: boolean | null
          rollback_reason: string | null
          rolled_back_at: string | null
          rolled_back_by: string | null
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
          rollback_force?: boolean | null
          rollback_reason?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
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
          rollback_force?: boolean | null
          rollback_reason?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
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
      punch_upload_row_logs: {
        Row: {
          action_taken: Database["public"]["Enums"]["action_taken"] | null
          id: string
          item_no: string | null
          processed_at: string
          raw_row_no: number | null
          reason_code: string | null
          reason_detail: string | null
          upload_id: string
        }
        Insert: {
          action_taken?: Database["public"]["Enums"]["action_taken"] | null
          id?: string
          item_no?: string | null
          processed_at?: string
          raw_row_no?: number | null
          reason_code?: string | null
          reason_detail?: string | null
          upload_id: string
        }
        Update: {
          action_taken?: Database["public"]["Enums"]["action_taken"] | null
          id?: string
          item_no?: string | null
          processed_at?: string
          raw_row_no?: number | null
          reason_code?: string | null
          reason_detail?: string | null
          upload_id?: string
        }
        Relationships: []
      }
      sc_no_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          defect_id: string
          id: string
          issue_no: string
          new_owner_code: string | null
          new_subcontractor_issue_no: string | null
          new_subcontractor_name: string | null
          old_owner_code: string | null
          old_subcontractor_issue_no: string | null
          old_subcontractor_name: string | null
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          defect_id: string
          id?: string
          issue_no: string
          new_owner_code?: string | null
          new_subcontractor_issue_no?: string | null
          new_subcontractor_name?: string | null
          old_owner_code?: string | null
          old_subcontractor_issue_no?: string | null
          old_subcontractor_name?: string | null
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          defect_id?: string
          id?: string
          issue_no?: string
          new_owner_code?: string | null
          new_subcontractor_issue_no?: string | null
          new_subcontractor_name?: string | null
          old_owner_code?: string | null
          old_subcontractor_issue_no?: string | null
          old_subcontractor_name?: string | null
          reason?: string | null
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
          r1_cur_gap_days: number | null
          r1_diff_days: number | null
          r1_new_date: string | null
          r1_old_date: string | null
          r1_prev_gap_days: number | null
          r2s_diff_days: number | null
          r2s_new_date: string | null
          r2s_old_date: string | null
          r2s_prev_gap_days: number | null
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
          r1_cur_gap_days?: number | null
          r1_diff_days?: number | null
          r1_new_date?: string | null
          r1_old_date?: string | null
          r1_prev_gap_days?: number | null
          r2s_diff_days?: number | null
          r2s_new_date?: string | null
          r2s_old_date?: string | null
          r2s_prev_gap_days?: number | null
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
          r1_cur_gap_days?: number | null
          r1_diff_days?: number | null
          r1_new_date?: string | null
          r1_old_date?: string | null
          r1_prev_gap_days?: number | null
          r2s_diff_days?: number | null
          r2s_new_date?: string | null
          r2s_old_date?: string | null
          r2s_prev_gap_days?: number | null
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
      slide_display_options: {
        Row: {
          created_at: string
          id: string
          options: Json
          slide_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          options?: Json
          slide_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          options?: Json
          slide_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      slide_text_overrides: {
        Row: {
          created_at: string
          field_key: string
          id: string
          slide_key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          created_at?: string
          field_key: string
          id?: string
          slide_key: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          id?: string
          slide_key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      spare_part_comment_reads: {
        Row: {
          id: string
          last_read_at: string
          spare_part_id: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          spare_part_id: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          spare_part_id?: string
          user_id?: string
        }
        Relationships: []
      }
      spare_part_comments: {
        Row: {
          author_user_id: string
          created_at: string
          edited: boolean
          id: string
          message: string
          parent_comment_id: string | null
          recipients: string[]
          spare_part_id: string
          type: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          created_at?: string
          edited?: boolean
          id?: string
          message: string
          parent_comment_id?: string | null
          recipients?: string[]
          spare_part_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          created_at?: string
          edited?: boolean
          id?: string
          message?: string
          parent_comment_id?: string | null
          recipients?: string[]
          spare_part_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spare_part_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "spare_part_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spare_part_comments_spare_part_id_fkey"
            columns: ["spare_part_id"]
            isOneToOne: false
            referencedRelation: "docs_spare_part"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractor_info_master: {
        Row: {
          acra_address: string | null
          acra_info_verified: boolean
          acra_reg_no: string | null
          created_at: string
          default_director_1: string | null
          default_director_2: string | null
          default_witness: string | null
          id: string
          last_subcontract_date: string | null
          notes: string | null
          subcontractor_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          acra_address?: string | null
          acra_info_verified?: boolean
          acra_reg_no?: string | null
          created_at?: string
          default_director_1?: string | null
          default_director_2?: string | null
          default_witness?: string | null
          id?: string
          last_subcontract_date?: string | null
          notes?: string | null
          subcontractor_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          acra_address?: string | null
          acra_info_verified?: boolean
          acra_reg_no?: string | null
          created_at?: string
          default_director_1?: string | null
          default_director_2?: string | null
          default_witness?: string | null
          id?: string
          last_subcontract_date?: string | null
          notes?: string | null
          subcontractor_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_info_master_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: true
            referencedRelation: "subcontractor_master"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractor_issue_counters: {
        Row: {
          next_seq: number
          owner_code: string
          project_id: string
          updated_at: string
        }
        Insert: {
          next_seq?: number
          owner_code: string
          project_id: string
          updated_at?: string
        }
        Update: {
          next_seq?: number
          owner_code?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      subcontractor_master: {
        Row: {
          acra_no: string | null
          acra_registered_address: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          director_1_name: string | null
          director_2_name: string | null
          id: string
          is_active: boolean
          name: string
          owner_code: string | null
          parent_subcontractor_id: string | null
          secretary_name: string | null
          type: string
        }
        Insert: {
          acra_no?: string | null
          acra_registered_address?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          director_1_name?: string | null
          director_2_name?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_code?: string | null
          parent_subcontractor_id?: string | null
          secretary_name?: string | null
          type?: string
        }
        Update: {
          acra_no?: string | null
          acra_registered_address?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          director_1_name?: string | null
          director_2_name?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_code?: string | null
          parent_subcontractor_id?: string | null
          secretary_name?: string | null
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
          {
            foreignKeyName: "subtest_change_log_subtest_id_fkey"
            columns: ["subtest_id"]
            isOneToOne: false
            referencedRelation: "subtests_active"
            referencedColumns: ["id"]
          },
        ]
      }
      subtest_comment_reads: {
        Row: {
          id: string
          last_read_at: string
          subtest_id: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          subtest_id: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          subtest_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtest_comment_reads_subtest_id_fkey"
            columns: ["subtest_id"]
            isOneToOne: false
            referencedRelation: "subtests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtest_comment_reads_subtest_id_fkey"
            columns: ["subtest_id"]
            isOneToOne: false
            referencedRelation: "subtests_active"
            referencedColumns: ["id"]
          },
        ]
      }
      subtest_comments: {
        Row: {
          author_user_id: string
          created_at: string
          edited: boolean
          id: string
          message: string
          parent_comment_id: string | null
          recipients: string[]
          subtest_id: string
          type: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          created_at?: string
          edited?: boolean
          id?: string
          message: string
          parent_comment_id?: string | null
          recipients?: string[]
          subtest_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          created_at?: string
          edited?: boolean
          id?: string
          message?: string
          parent_comment_id?: string | null
          recipients?: string[]
          subtest_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtest_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "subtest_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtest_comments_subtest_id_fkey"
            columns: ["subtest_id"]
            isOneToOne: false
            referencedRelation: "subtests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subtest_comments_subtest_id_fkey"
            columns: ["subtest_id"]
            isOneToOne: false
            referencedRelation: "subtests_active"
            referencedColumns: ["id"]
          },
        ]
      }
      subtests: {
        Row: {
          aconex_ref_no: string | null
          critical_marked_at: string | null
          critical_marked_by: string | null
          critical_marked_by_name: string | null
          custom_payload: Json
          data_source_type: Database["public"]["Enums"]["data_source"] | null
          description: string | null
          equipment: string | null
          hdec_pic_name: string | null
          id: string
          is_active: boolean
          is_critical: boolean
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
          r1_actual_submission_date: string | null
          r1_report_ref: string | null
          r1_status: Database["public"]["Enums"]["report_status"] | null
          r1_target_submission_date: string | null
          r2_actual_approval_date: string | null
          r2_actual_submission_date: string | null
          r2_status: Database["public"]["Enums"]["report_status"] | null
          r2_target_approval_date: string | null
          r2_target_submission_date: string | null
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
          critical_marked_at?: string | null
          critical_marked_by?: string | null
          critical_marked_by_name?: string | null
          custom_payload?: Json
          data_source_type?: Database["public"]["Enums"]["data_source"] | null
          description?: string | null
          equipment?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          is_critical?: boolean
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
          r1_actual_submission_date?: string | null
          r1_report_ref?: string | null
          r1_status?: Database["public"]["Enums"]["report_status"] | null
          r1_target_submission_date?: string | null
          r2_actual_approval_date?: string | null
          r2_actual_submission_date?: string | null
          r2_status?: Database["public"]["Enums"]["report_status"] | null
          r2_target_approval_date?: string | null
          r2_target_submission_date?: string | null
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
          critical_marked_at?: string | null
          critical_marked_by?: string | null
          critical_marked_by_name?: string | null
          custom_payload?: Json
          data_source_type?: Database["public"]["Enums"]["data_source"] | null
          description?: string | null
          equipment?: string | null
          hdec_pic_name?: string | null
          id?: string
          is_active?: boolean
          is_critical?: boolean
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
          r1_actual_submission_date?: string | null
          r1_report_ref?: string | null
          r1_status?: Database["public"]["Enums"]["report_status"] | null
          r1_target_submission_date?: string | null
          r2_actual_approval_date?: string | null
          r2_actual_submission_date?: string | null
          r2_status?: Database["public"]["Enums"]["report_status"] | null
          r2_target_approval_date?: string | null
          r2_target_submission_date?: string | null
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
          rollback_force: boolean | null
          rolled_back_at: string | null
          rolled_back_by: string | null
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
          rollback_force?: boolean | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
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
          rollback_force?: boolean | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
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
      warranty_change_log: {
        Row: {
          change_source: Database["public"]["Enums"]["change_source"] | null
          changed_at: string
          changed_by: string | null
          changed_field: string
          id: string
          new_value: string | null
          old_value: string | null
          upload_id: string | null
          warranty_item_id: string
        }
        Insert: {
          change_source?: Database["public"]["Enums"]["change_source"] | null
          changed_at?: string
          changed_by?: string | null
          changed_field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          upload_id?: string | null
          warranty_item_id: string
        }
        Update: {
          change_source?: Database["public"]["Enums"]["change_source"] | null
          changed_at?: string
          changed_by?: string | null
          changed_field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          upload_id?: string | null
          warranty_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_change_log_warranty_item_id_fkey"
            columns: ["warranty_item_id"]
            isOneToOne: false
            referencedRelation: "warranty_items"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_comment_reads: {
        Row: {
          id: string
          last_read_at: string
          user_id: string
          warranty_item_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          user_id: string
          warranty_item_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          user_id?: string
          warranty_item_id?: string
        }
        Relationships: []
      }
      warranty_comments: {
        Row: {
          author_user_id: string
          created_at: string
          edited: boolean
          id: string
          message: string
          parent_comment_id: string | null
          recipients: string[]
          type: string
          updated_at: string
          warranty_item_id: string
        }
        Insert: {
          author_user_id: string
          created_at?: string
          edited?: boolean
          id?: string
          message: string
          parent_comment_id?: string | null
          recipients?: string[]
          type?: string
          updated_at?: string
          warranty_item_id: string
        }
        Update: {
          author_user_id?: string
          created_at?: string
          edited?: boolean
          id?: string
          message?: string
          parent_comment_id?: string | null
          recipients?: string[]
          type?: string
          updated_at?: string
          warranty_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "warranty_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_comments_warranty_item_id_fkey"
            columns: ["warranty_item_id"]
            isOneToOne: false
            referencedRelation: "warranty_items"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_items: {
        Row: {
          acra_info_status: string | null
          category: string | null
          contract_spec_ref: string | null
          created_at: string
          created_by: string | null
          current_stage: string | null
          current_status: string | null
          custom_payload: Json
          data_source_type: string | null
          draft_actual_date: string | null
          draft_planned_date: string | null
          draft_response_actual_date: string | null
          draft_response_planned_date: string | null
          draft_status: Database["public"]["Enums"]["warranty_status"] | null
          final_actual_date: string | null
          final_planned_date: string | null
          final_status: Database["public"]["Enums"]["warranty_status"] | null
          hdec_eng_name: string | null
          hdec_pic_name: string | null
          hdec_signing_actual_date: string | null
          hdec_signing_planned_date: string | null
          hdec_signing_status:
            | Database["public"]["Enums"]["warranty_status"]
            | null
          id: string
          is_active: boolean
          is_resubmission: boolean
          item_no: number
          parent_id: string | null
          project_id: string
          r_acra_address: string | null
          r_acra_reg_no: string | null
          r_brief_description: string | null
          r_director_1: string | null
          r_director_2: string | null
          r_subcontract_date: string | null
          r_witness: string | null
          r_works_description: string | null
          raw_payload: Json
          remarks: string | null
          resubmission_seq: number
          row_version: number
          source_upload_id: string | null
          subcon_signing_actual_date: string | null
          subcon_signing_planned_date: string | null
          subcon_signing_status:
            | Database["public"]["Enums"]["warranty_status"]
            | null
          subcontractor_id: string | null
          subcontractor_name: string | null
          subsub_name: string | null
          team: string | null
          updated_at: string
          updated_by: string | null
          warranted_item: string | null
          warranty_period_years: number | null
        }
        Insert: {
          acra_info_status?: string | null
          category?: string | null
          contract_spec_ref?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string | null
          current_status?: string | null
          custom_payload?: Json
          data_source_type?: string | null
          draft_actual_date?: string | null
          draft_planned_date?: string | null
          draft_response_actual_date?: string | null
          draft_response_planned_date?: string | null
          draft_status?: Database["public"]["Enums"]["warranty_status"] | null
          final_actual_date?: string | null
          final_planned_date?: string | null
          final_status?: Database["public"]["Enums"]["warranty_status"] | null
          hdec_eng_name?: string | null
          hdec_pic_name?: string | null
          hdec_signing_actual_date?: string | null
          hdec_signing_planned_date?: string | null
          hdec_signing_status?:
            | Database["public"]["Enums"]["warranty_status"]
            | null
          id?: string
          is_active?: boolean
          is_resubmission?: boolean
          item_no: number
          parent_id?: string | null
          project_id: string
          r_acra_address?: string | null
          r_acra_reg_no?: string | null
          r_brief_description?: string | null
          r_director_1?: string | null
          r_director_2?: string | null
          r_subcontract_date?: string | null
          r_witness?: string | null
          r_works_description?: string | null
          raw_payload?: Json
          remarks?: string | null
          resubmission_seq?: number
          row_version?: number
          source_upload_id?: string | null
          subcon_signing_actual_date?: string | null
          subcon_signing_planned_date?: string | null
          subcon_signing_status?:
            | Database["public"]["Enums"]["warranty_status"]
            | null
          subcontractor_id?: string | null
          subcontractor_name?: string | null
          subsub_name?: string | null
          team?: string | null
          updated_at?: string
          updated_by?: string | null
          warranted_item?: string | null
          warranty_period_years?: number | null
        }
        Update: {
          acra_info_status?: string | null
          category?: string | null
          contract_spec_ref?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: string | null
          current_status?: string | null
          custom_payload?: Json
          data_source_type?: string | null
          draft_actual_date?: string | null
          draft_planned_date?: string | null
          draft_response_actual_date?: string | null
          draft_response_planned_date?: string | null
          draft_status?: Database["public"]["Enums"]["warranty_status"] | null
          final_actual_date?: string | null
          final_planned_date?: string | null
          final_status?: Database["public"]["Enums"]["warranty_status"] | null
          hdec_eng_name?: string | null
          hdec_pic_name?: string | null
          hdec_signing_actual_date?: string | null
          hdec_signing_planned_date?: string | null
          hdec_signing_status?:
            | Database["public"]["Enums"]["warranty_status"]
            | null
          id?: string
          is_active?: boolean
          is_resubmission?: boolean
          item_no?: number
          parent_id?: string | null
          project_id?: string
          r_acra_address?: string | null
          r_acra_reg_no?: string | null
          r_brief_description?: string | null
          r_director_1?: string | null
          r_director_2?: string | null
          r_subcontract_date?: string | null
          r_witness?: string | null
          r_works_description?: string | null
          raw_payload?: Json
          remarks?: string | null
          resubmission_seq?: number
          row_version?: number
          source_upload_id?: string | null
          subcon_signing_actual_date?: string | null
          subcon_signing_planned_date?: string | null
          subcon_signing_status?:
            | Database["public"]["Enums"]["warranty_status"]
            | null
          subcontractor_id?: string | null
          subcontractor_name?: string | null
          subsub_name?: string | null
          team?: string | null
          updated_at?: string
          updated_by?: string | null
          warranted_item?: string | null
          warranty_period_years?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warranty_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "warranty_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_items_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractor_master"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_threads: {
        Row: {
          action_party: string | null
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          sort_order: number
          source_upload_id: string | null
          thread_date: string | null
          thread_label: string
          updated_at: string
          updated_by: string | null
          warranty_item_id: string
        }
        Insert: {
          action_party?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          sort_order?: number
          source_upload_id?: string | null
          thread_date?: string | null
          thread_label: string
          updated_at?: string
          updated_by?: string | null
          warranty_item_id: string
        }
        Update: {
          action_party?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          sort_order?: number
          source_upload_id?: string | null
          thread_date?: string | null
          thread_label?: string
          updated_at?: string
          updated_by?: string | null
          warranty_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_threads_warranty_item_id_fkey"
            columns: ["warranty_item_id"]
            isOneToOne: false
            referencedRelation: "warranty_items"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_upload_batches: {
        Row: {
          data_date: string | null
          id: string
          inserted_rows: number | null
          note: string | null
          processed_rows: number | null
          project_id: string | null
          rejected_rows: number | null
          source_filename: string | null
          total_rows: number | null
          updated_rows: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          data_date?: string | null
          id?: string
          inserted_rows?: number | null
          note?: string | null
          processed_rows?: number | null
          project_id?: string | null
          rejected_rows?: number | null
          source_filename?: string | null
          total_rows?: number | null
          updated_rows?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          data_date?: string | null
          id?: string
          inserted_rows?: number | null
          note?: string | null
          processed_rows?: number | null
          project_id?: string | null
          rejected_rows?: number | null
          source_filename?: string | null
          total_rows?: number | null
          updated_rows?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warranty_upload_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_upload_row_logs: {
        Row: {
          created_at: string
          id: string
          item_no: number | null
          message: string | null
          row_no: number | null
          status: string | null
          upload_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_no?: number | null
          message?: string | null
          row_no?: number | null
          status?: string | null
          upload_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_no?: number | null
          message?: string | null
          row_no?: number | null
          status?: string | null
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_upload_row_logs_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "warranty_upload_batches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      subtests_active: {
        Row: {
          aconex_ref_no: string | null
          critical_marked_at: string | null
          critical_marked_by: string | null
          critical_marked_by_name: string | null
          custom_payload: Json | null
          data_source_type: Database["public"]["Enums"]["data_source"] | null
          description: string | null
          equipment: string | null
          hdec_pic_name: string | null
          id: string | null
          is_active: boolean | null
          is_critical: boolean | null
          item_no: string | null
          level: string | null
          mos_code: string | null
          mos_sequence: number | null
          pred_actual_date: string | null
          pred_planned_date: string | null
          pred_status: Database["public"]["Enums"]["tc_status"] | null
          predecessor_status_raw: string | null
          project_id: string | null
          punchlist_comments: string | null
          r1_actual_submission_date: string | null
          r1_report_ref: string | null
          r1_status: Database["public"]["Enums"]["report_status"] | null
          r1_target_submission_date: string | null
          r2_actual_approval_date: string | null
          r2_actual_submission_date: string | null
          r2_status: Database["public"]["Enums"]["report_status"] | null
          r2_target_approval_date: string | null
          r2_target_submission_date: string | null
          remarks: string | null
          row_version: number | null
          source_upload_id: string | null
          subcontractor_name: string | null
          subsub_name: string | null
          subtest_id: string | null
          system_id: string | null
          t1_actual_date: string | null
          t1_planned_date: string | null
          t1_status: Database["public"]["Enums"]["tc_status"] | null
          t2_actual_date: string | null
          t2_planned_date: string | null
          t2_status: Database["public"]["Enums"]["tc_status"] | null
          team: Database["public"]["Enums"]["team_type"] | null
          test_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          aconex_ref_no?: string | null
          critical_marked_at?: string | null
          critical_marked_by?: string | null
          critical_marked_by_name?: string | null
          custom_payload?: Json | null
          data_source_type?: Database["public"]["Enums"]["data_source"] | null
          description?: string | null
          equipment?: string | null
          hdec_pic_name?: string | null
          id?: string | null
          is_active?: boolean | null
          is_critical?: boolean | null
          item_no?: string | null
          level?: string | null
          mos_code?: string | null
          mos_sequence?: number | null
          pred_actual_date?: string | null
          pred_planned_date?: string | null
          pred_status?: Database["public"]["Enums"]["tc_status"] | null
          predecessor_status_raw?: string | null
          project_id?: string | null
          punchlist_comments?: string | null
          r1_actual_submission_date?: string | null
          r1_report_ref?: string | null
          r1_status?: Database["public"]["Enums"]["report_status"] | null
          r1_target_submission_date?: string | null
          r2_actual_approval_date?: string | null
          r2_actual_submission_date?: string | null
          r2_status?: Database["public"]["Enums"]["report_status"] | null
          r2_target_approval_date?: string | null
          r2_target_submission_date?: string | null
          remarks?: string | null
          row_version?: number | null
          source_upload_id?: string | null
          subcontractor_name?: string | null
          subsub_name?: string | null
          subtest_id?: string | null
          system_id?: string | null
          t1_actual_date?: string | null
          t1_planned_date?: string | null
          t1_status?: Database["public"]["Enums"]["tc_status"] | null
          t2_actual_date?: string | null
          t2_planned_date?: string | null
          t2_status?: Database["public"]["Enums"]["tc_status"] | null
          team?: Database["public"]["Enums"]["team_type"] | null
          test_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          aconex_ref_no?: string | null
          critical_marked_at?: string | null
          critical_marked_by?: string | null
          critical_marked_by_name?: string | null
          custom_payload?: Json | null
          data_source_type?: Database["public"]["Enums"]["data_source"] | null
          description?: string | null
          equipment?: string | null
          hdec_pic_name?: string | null
          id?: string | null
          is_active?: boolean | null
          is_critical?: boolean | null
          item_no?: string | null
          level?: string | null
          mos_code?: string | null
          mos_sequence?: number | null
          pred_actual_date?: string | null
          pred_planned_date?: string | null
          pred_status?: Database["public"]["Enums"]["tc_status"] | null
          predecessor_status_raw?: string | null
          project_id?: string | null
          punchlist_comments?: string | null
          r1_actual_submission_date?: string | null
          r1_report_ref?: string | null
          r1_status?: Database["public"]["Enums"]["report_status"] | null
          r1_target_submission_date?: string | null
          r2_actual_approval_date?: string | null
          r2_actual_submission_date?: string | null
          r2_status?: Database["public"]["Enums"]["report_status"] | null
          r2_target_approval_date?: string | null
          r2_target_submission_date?: string | null
          remarks?: string | null
          row_version?: number | null
          source_upload_id?: string | null
          subcontractor_name?: string | null
          subsub_name?: string | null
          subtest_id?: string | null
          system_id?: string | null
          t1_actual_date?: string | null
          t1_planned_date?: string | null
          t1_status?: Database["public"]["Enums"]["tc_status"] | null
          t2_actual_date?: string | null
          t2_planned_date?: string | null
          t2_status?: Database["public"]["Enums"]["tc_status"] | null
          team?: Database["public"]["Enums"]["team_type"] | null
          test_id?: string | null
          updated_at?: string | null
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
    }
    Functions: {
      _canonical_level: { Args: { v: string }; Returns: string }
      _compare_key: { Args: { v: string }; Returns: string }
      _event_log_actor_role: { Args: { _user_id: string }; Returns: string }
      _is_level_token: { Args: { v: string }; Returns: boolean }
      _parse_area: {
        Args: { area: string }
        Returns: {
          area_level: string
          area_location: string
          area_type: string
        }[]
      }
      add_business_days_no_sun: {
        Args: { base: string; days: number }
        Returns: string
      }
      allot_subcontractor_issue_no: {
        Args: { _count?: number; _owner_code: string; _project_id: string }
        Returns: number[]
      }
      bump_subcontractor_issue_counter: {
        Args: { _owner_code: string; _project_id: string; _used_seq: number }
        Returns: number
      }
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
      can_modify_defect_comment: {
        Args: { _comment_id: string; _user_id: string }
        Returns: boolean
      }
      can_modify_omm_comment: {
        Args: { _comment_id: string; _user_id: string }
        Returns: boolean
      }
      can_modify_subtest_comment: {
        Args: { _comment_id: string; _user_id: string }
        Returns: boolean
      }
      can_modify_warranty_comment: {
        Args: { _comment_id: string; _user_id: string }
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
      can_write_for_team: {
        Args: {
          _team: Database["public"]["Enums"]["team_type"]
          _user_id: string
        }
        Returns: boolean
      }
      compute_omm_status: {
        Args: { row_data: Database["public"]["Tables"]["docs_omm"]["Row"] }
        Returns: string
      }
      compute_warranty_stage_status: {
        Args: {
          row_data: Database["public"]["Tables"]["warranty_items"]["Row"]
        }
        Returns: {
          stage: string
          status: string
        }[]
      }
      create_omm_resubmission: {
        Args: { p_parent_id: string; p_stage: string }
        Returns: string
      }
      create_warranty_resubmission: {
        Args: { p_parent_id: string; p_stage: string }
        Returns: string
      }
      delete_defect_import_batch: {
        Args: { _batch_id: string }
        Returns: undefined
      }
      delete_defects_cascade: { Args: { _ids: string[] }; Returns: Json }
      delete_docs_import_batch: { Args: { _batch_id: string }; Returns: Json }
      delete_subtests_cascade: { Args: { _ids: string[] }; Returns: Json }
      delete_warranty_cascade: { Args: { _ids: string[] }; Returns: Json }
      get_defect_comment_summary: {
        Args: { _defect_ids: string[] }
        Returns: {
          comment_count: number
          comment_count_only: number
          defect_id: string
          has_unread: boolean
          instruction_count: number
          last_activity_at: string
          reply_count: number
        }[]
      }
      get_defect_edit_scope: {
        Args: { _defect_id: string; _user_id: string }
        Returns: string
      }
      get_defect_edit_scope_bulk: {
        Args: { _ids: string[]; _user_id: string }
        Returns: {
          id: string
          scope: string
        }[]
      }
      get_subtest_comment_summary: {
        Args: { _subtest_ids: string[] }
        Returns: {
          comment_count: number
          comment_count_only: number
          has_unread: boolean
          instruction_count: number
          last_activity_at: string
          reply_count: number
          subtest_id: string
        }[]
      }
      get_subtest_edit_scope: {
        Args: { _subtest_id: string; _user_id: string }
        Returns: string
      }
      get_subtest_edit_scope_bulk: {
        Args: { _ids: string[]; _user_id: string }
        Returns: {
          id: string
          scope: string
        }[]
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
      is_reserved_custom_field: {
        Args: { _field_name: string; _module: string }
        Returns: boolean
      }
      is_senior_or_above: { Args: { _user_id: string }; Returns: boolean }
      normalize_owner_code: { Args: { _value: string }; Returns: string }
      preview_delete_defects_cascade: {
        Args: { _ids: string[] }
        Returns: Json
      }
      preview_delete_subtests_cascade: {
        Args: { _ids: string[] }
        Returns: Json
      }
      preview_rollback_defect_import_batch: {
        Args: { _batch_id: string }
        Returns: Json
      }
      preview_rollback_docs_omm_batch: {
        Args: { _batch_id: string }
        Returns: Json
      }
      preview_rollback_punch_import_batch: {
        Args: { _batch_id: string }
        Returns: Json
      }
      preview_rollback_upload_batch: {
        Args: { _batch_id: string }
        Returns: Json
      }
      purge_old_event_log: { Args: never; Returns: number }
      restore_insert_rows: {
        Args: { _rows: Json; _table: string }
        Returns: number
      }
      restore_truncate_all: { Args: { _tables: string[] }; Returns: undefined }
      rollback_defect_import_batch: {
        Args: { _batch_id: string; _force?: boolean }
        Returns: Json
      }
      rollback_docs_omm_batch: {
        Args: { _batch_id: string; _force?: boolean }
        Returns: Json
      }
      rollback_punch_import_batch: {
        Args: { _batch_id: string; _force?: boolean }
        Returns: Json
      }
      rollback_upload_batch: {
        Args: { _batch_id: string; _force?: boolean }
        Returns: Json
      }
      suggest_owner_code: { Args: { _name: string }; Returns: string }
      sync_all_subcontractor_counters: {
        Args: { _project_id: string }
        Returns: {
          out_next_seq: number
          out_owner_code: string
        }[]
      }
      user_team_matches: {
        Args: {
          _team: Database["public"]["Enums"]["team_type"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      action_taken: "inserted" | "updated" | "skipped" | "rejected"
      app_role:
        | "guest"
        | "super_guest"
        | "user"
        | "senior_user"
        | "d_superuser"
        | "superuser"
        | "admin"
      change_source:
        | "app_direct_input"
        | "mobile_input"
        | "excel_import"
        | "admin_edit"
        | "rollback"
      data_source:
        | "legacy_import_inherited"
        | "app_direct_input"
        | "mobile_input"
        | "standard_import"
        | "admin_edit"
      import_type: "legacy" | "standard"
      punch_gate_status: "not_required" | "pending" | "approved"
      punch_health_status: "ahead" | "on_track" | "behind" | "critical"
      punch_procurement_status:
        | "not_required"
        | "pending"
        | "partially_secured"
        | "secured"
      report_status:
        | "Planned"
        | "Submitted"
        | "Under Review"
        | "Approved"
        | "Returned"
      tc_status: "Planned" | "WIP" | "Done" | "Hold"
      team_type: "Mech" | "Elec" | "Arch" | "Supp" | "Design"
      upload_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "rolled_back"
      user_type:
        | "subcontractor"
        | "hdec"
        | "pm_pd"
        | "admin"
        | "subsub"
        | "guest"
      warranty_status: "A" | "B" | "C" | "UR" | "WIP" | "Planned"
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
        "d_superuser",
        "superuser",
        "admin",
      ],
      change_source: [
        "app_direct_input",
        "mobile_input",
        "excel_import",
        "admin_edit",
        "rollback",
      ],
      data_source: [
        "legacy_import_inherited",
        "app_direct_input",
        "mobile_input",
        "standard_import",
        "admin_edit",
      ],
      import_type: ["legacy", "standard"],
      punch_gate_status: ["not_required", "pending", "approved"],
      punch_health_status: ["ahead", "on_track", "behind", "critical"],
      punch_procurement_status: [
        "not_required",
        "pending",
        "partially_secured",
        "secured",
      ],
      report_status: [
        "Planned",
        "Submitted",
        "Under Review",
        "Approved",
        "Returned",
      ],
      tc_status: ["Planned", "WIP", "Done", "Hold"],
      team_type: ["Mech", "Elec", "Arch", "Supp", "Design"],
      upload_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "rolled_back",
      ],
      user_type: ["subcontractor", "hdec", "pm_pd", "admin", "subsub", "guest"],
      warranty_status: ["A", "B", "C", "UR", "WIP", "Planned"],
    },
  },
} as const
