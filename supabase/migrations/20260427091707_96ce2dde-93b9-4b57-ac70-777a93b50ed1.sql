-- (1) 정규화 트리거 보강: 빈 문자열도 NULL로 변환
CREATE OR REPLACE FUNCTION public.fn_subcontractor_master_normalize_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_code IS NOT NULL THEN
    NEW.owner_code := nullif(upper(trim(NEW.owner_code)), '');
  END IF;
  RETURN NEW;
END;
$$;

-- (2) 활성 마스터 owner_code 부분 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS subcontractor_master_owner_code_active_uq
  ON public.subcontractor_master (owner_code)
  WHERE owner_code IS NOT NULL AND is_active = true;