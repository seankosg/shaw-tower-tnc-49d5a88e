# Defect Import 데이터가 Raw Data 화면에 보이지 않는 문제

## 진단 결과 (DB 확인 완료)

업로드한 파일의 시트 이름은 정확히는 **`part(2)`** 였고, 7개 행이 모두 정상적으로 import 되었습니다.

- Upload batch (`829533f9...`): `total=7, success=7, skipped=0, rejected=0`, status=`completed`
- Row logs: 7개 모두 `action_taken='updated'` (신규 insert가 아닌 **기존 행 update**)
- 대상 Issue No: `986, 1111, 1749, 1758, 1848, 1858, 1859`

**진짜 원인:** DB에 해당 Issue No들이 **이미 존재**하고 있었고, **`is_active = false`** 상태였습니다. Raw Data 페이지(`DefectRawDataPage.tsx` 415번 줄)는 `.eq('is_active', true)` 필터로 조회하므로 이 7건이 화면에서 숨겨집니다.

전체 2942건 중 정확히 이 7건만 inactive 상태이며(나머지 2935건은 active), 이전에 어떤 이유로(예: 수동 비활성화, rollback 부산물 등) is_active가 false로 설정되었습니다. 현재 import 로직(`DefectImportContext.tsx`의 update 경로, 약 864번 줄)은 update 시 `is_active`를 건드리지 않으므로 false 상태가 그대로 유지됩니다.

## 변경 계획

### 1. 즉시 조치 — 숨겨진 7건 재활성화 (마이그레이션)

다음 7개 Issue No의 `is_active`를 `true`로 되돌립니다. 이번 업로드 batch가 실제로 이 행들을 업데이트했음이 row log로 확인되었으므로 안전합니다.

```sql
UPDATE public.defect_items
SET is_active = true, updated_at = now()
WHERE issue_no IN ('986','1111','1749','1758','1848','1858','1859')
  AND is_active = false;
```

### 2. 재발 방지 — Import 시 자동 재활성화

`src/contexts/DefectImportContext.tsx`의 update 경로(약 800~870 라인 영역, `existing` 행을 update하는 부분)에서 update payload에 `is_active: true`를 항상 포함시킵니다.

근거: import 파일에 명시적으로 행이 들어왔다는 것은 "현재 유효한 결함"이라는 뜻이므로, 과거에 어떤 이유로 inactive 처리되었더라도 다시 활성화하는 것이 자연스럽습니다. (Insert 경로는 기본값 `true`라 문제없음.)

### 3. (선택) 진단 도움말

향후 같은 혼동을 막기 위해 Defect Import Logs 화면에 행이 "updated"로 처리되었지만 현재 화면에서 보이지 않을 수 있다는 안내를 추가하는 것은 별도 개선 항목으로 남겨두고, 이번 변경에는 포함하지 않습니다.

## 영향 범위

- 영향 테이블: `defect_items` (7행만 update)
- 코드 변경: `src/contexts/DefectImportContext.tsx` 한 파일 (update payload에 `is_active: true` 추가)
- Raw Data 화면, 통계, 대시보드 모두 자동 반영 (기존 RLS/필터 그대로 사용)

승인해 주시면 마이그레이션 실행 + 코드 수정을 함께 진행하겠습니다.
