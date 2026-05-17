UPDATE public.code_file_versions
   SET is_active = false
 WHERE file_name = 'ppt-builder.ts' AND is_active = true;

INSERT INTO public.code_file_versions
  (file_name, storage_path, change_summary_ko, instruction, is_active, uploaded_by)
VALUES
  ('ppt-builder.ts',
   'history/ppt-builder_2026-05-17_07-00_sync.ts',
   'Codebase에서 강제 동기화 (잘린 버전 복구 — 1448줄 전체)',
   'Forced sync from src/lib/ppt-builder.ts (1448 lines)',
   true,
   NULL);