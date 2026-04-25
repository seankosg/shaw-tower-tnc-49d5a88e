
-- 1. enum 확장
ALTER TYPE public.upload_status ADD VALUE IF NOT EXISTS 'rolled_back';
ALTER TYPE public.change_source ADD VALUE IF NOT EXISTS 'rollback';

-- 2. 배치 테이블에 rollback 메타 컬럼 추가
ALTER TABLE public.upload_batches
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz,
  ADD COLUMN IF NOT EXISTS rolled_back_by uuid,
  ADD COLUMN IF NOT EXISTS rollback_force boolean;

ALTER TABLE public.defect_upload_batches
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz,
  ADD COLUMN IF NOT EXISTS rolled_back_by uuid,
  ADD COLUMN IF NOT EXISTS rollback_force boolean;
