-- Defect 트랜잭션 데이터 일괄 초기화
-- 분류 규칙(defect_classification_rules), 분야 fallback(defect_discipline_fallback),
-- 필드 설정(defect_field_config), 마스터 테이블, database_snapshots는 보존.
TRUNCATE TABLE
  public.defect_change_log,
  public.defect_schedule_change_audit,
  public.defect_daily_snapshots,
  public.defect_upload_row_logs,
  public.sc_no_history,
  public.defect_comment_reads,
  public.defect_comments,
  public.defect_items,
  public.defect_upload_batches
RESTART IDENTITY;