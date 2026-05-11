## OMM Header Mapping "(unmapped — 40 aliases)" 원인과 해결

### 원인
`src/pages/admin/HeaderMappingsTab.tsx`의 `DOCS_OMM_FIELDS` 화이트리스트가 **현재 OMM 파서/스키마보다 오래됐습니다.**

Admin UI는 이 화이트리스트에 없는 `target_field`로 매핑된 DB 행들을 모두 "(unmapped)" 그룹에 몰아넣습니다. 즉 매핑 자체는 정상 동작 중이지만 화면에서 "관리 대상이 아닌" 것처럼 보이는 것뿐입니다.

스크린샷의 40개 unmapped는 전부 **sub1_*/sub2_*/sub3_*** 와 **skip** 으로, 파서는 이미 이 필드에 정상 write 하고 있습니다.

### 누락된 필드 (15 + 1)
현재 `DOCS_OMM_FIELDS`(102-112행)에 추가해야 할 항목:

```
sub1_planned_date, sub1_actual_date, sub1_response_date, sub1_response_status,
sub2_planned_date, sub2_actual_date, sub2_response_planned_date,
sub2_response_actual_date, sub2_response_status,
sub3_planned_date, sub3_actual_date, sub3_response_planned_date,
sub3_response_actual_date, sub3_response_status,
skip   ← 시스템 컬럼 무시용 pseudo-target (As-Built처럼 별칭 등록 가능하도록)
```

(legacy `draft_*` 4개와 final_* 5개, instruction_date, current_stage/current_status는 이미 포함되어 있음)

### 변경 사항 (단일 파일, 빌드 모드에서 실행)

**파일:** `src/pages/admin/HeaderMappingsTab.tsx`

1. `DOCS_OMM_FIELDS` 배열에 위 16개 항목 추가 (논리적 순서: sn → 식별/메타 → 수량 → instruction → draft(legacy) → sub1 → sub2 → sub3 → final → PIC/remarks → current_*).
2. 배열 끝에 `'skip'` 추가 (As-Built/Warranty와 동일 패턴 — DB에 이미 `stage → skip` 행이 있어 자동으로 그룹에 들어감).

### 변경 없음 (사용자 결정 보류 항목)
- 파서 `FALLBACK_ALIASES` 정리 / DB 죽은 별칭 cleanup / `instruction date` 활성화 충돌 — 이전 검토 보고서의 4가지 결정 항목은 별도 작업으로 분리. 본 변경은 Admin UI 화이트리스트만 최신화.

### 검증
1. Admin → Header Mappings → Docs → OMM 진입.
2. "(unmapped — 40 aliases)" 그룹이 사라지고, 각 sub1_*/sub2_*/sub3_* / skip 그룹에 정상 분류되어 "+ Alias" 버튼으로 별칭 추가가 가능해지는지 확인.
3. 기존 OMM 임포트 동작에는 영향 없음(파서/DB 무변경).
