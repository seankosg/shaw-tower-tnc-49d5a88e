# OMM Raw Data 상세창 구현 계획

`/docs/omm/:id` 페이지를 현재의 기본 형태에서 ABD/Defect 상세 페이지 수준으로 강화합니다. **Field Config(`docs_field_config`, sub_module='omm')를 단일 진실 원천**으로 사용해 섹션·라벨·표시 여부·정렬을 결정하고, 전 필드 인라인 편집을 제공합니다.

## 1. 페이지 레이아웃

```text
[← Back to OMM]   SN — Work/Trade/Material      [OmmStatusBadge]  [Updated DD MMM YYYY HH:mm]

┌─ Identity ─────────────────────────────────────────────┐
│  SN, Category Group, Category(Team), Section,         │
│  Trade, Subcontractor, Training Required,             │
│  HDEC PIC, HDEC ENG                                    │
└────────────────────────────────────────────────────────┘
┌─ Copy Quantities ──────────────────────────────────────┐
│  PDF Required / Actual   |   Hardcopy Required / Actual│
│  (OmmCopyQuantityCell 시각 알림 유지)                   │
└────────────────────────────────────────────────────────┘
┌─ Workflow ─────────────────────────────────────────────┐
│  Instruction Date                                      │
│  Draft  : Planned / Actual / Response Date / Status   │
│  Final  : Planned / Actual                             │
│  Final Response : Planned / Actual / Status            │
│  (OmmCycleProgress 시각화 추가)                         │
└────────────────────────────────────────────────────────┘
┌─ Remarks ──────────────────────────────────────────────┐
└────────────────────────────────────────────────────────┘
┌─ Custom Fields (custom_payload, 있을 때만) ─────────────┐
└────────────────────────────────────────────────────────┘
┌─ Change History (docs_change_log)                       │
└────────────────────────────────────────────────────────┘
┌─ Comments (omm_comments, id="comments")                 │
└────────────────────────────────────────────────────────┘
```

## 2. Field Config 연동 규칙

- `useDocsFieldConfig('omm')`의 `getLabel`, `isFieldVisible`, `sortFieldNames` 사용
- 각 섹션은 **고정된 필드 그룹 정의 + Field Config 정렬·가시성 적용**:
  - `IDENTITY_FIELDS`, `QUANTITY_FIELDS`, `WORKFLOW_FIELDS` 상수
  - 해당 그룹 안에서 `sortFieldNames()`로 순서 결정
  - `isFieldVisible(field)`가 false면 비표시(라벨도 Field Config의 `display_name` 사용)
- `category` → "Sub-category", `category_group` → "Category", `team` → "Team"는 이미 `DOCS_DEFAULT_FIELD_LABELS`에 등록되어 있으므로 추가 작업 없음

## 3. 인라인 편집 (전 필드)

각 필드 타입별 입력 컴포넌트:

| 타입 | 필드 | 컴포넌트 |
|---|---|---|
| 텍스트 | sn, work_trade_material, section, remarks | Input/Textarea (onBlur 저장) |
| 정수 | pdf_required_qty, pdf_actual_qty, hardcopy_required_qty, hardcopy_actual_qty | Input type="number" |
| 날짜 | instruction_date, draft_planned/actual/response_date, final_planned/actual_date, final_response_planned/actual_date | Input type="date" |
| Select | draft_response_status, final_response_status (—/A/B/C), training_required (Yes/No/—), team (ALL_TEAMS), category_group (Architectural/M&E/Misc), category | Select |
| Suggest | subcontractor_name, hdec_pic_name, hdec_eng_name | SuggestField (master 테이블 옵션) |

저장 로직:
- 변경 감지된 필드만 `docs_omm.update({field: value, updated_by})` 패치
- 성공 시 toast + 재로드 (또는 setRow에 반영)
- 실패 시 toast(destructive) — RLS 위반(403)이면 "수정 권한이 없습니다" 메시지

## 4. 권한 (앱 RLS 정책 그대로)

- DB의 `docs_omm` UPDATE 정책이 모든 권한 검증을 처리:
  - admin/superuser/senior_user/user → 모든 row
  - d_superuser → `user_team_matches(auth.uid(), team)` 행만
  - 그 외(guest/super_guest) → 차단
- 클라이언트는 별도 분기 없이 update 시도, RLS 거부 시 에러 메시지 표시
- UI는 user.role을 가져와 편집 불가 사용자(guest/super_guest)에게는 입력을 `disabled` 처리해 사용성 개선 (Defect 페이지의 `scope` 패턴과 유사)

## 5. 부가 기능

- **OmmStatusBadge**: 현재 상태 표시 (이미 존재)
- **OmmCycleProgress**: Workflow 섹션 상단에 진행도 시각화 (이미 존재, 신규 사용)
- **Change History**: `docs_change_log` 중 `record_id = id AND sub_module = 'omm'` 최근 50건
- **Comments**: 현재 `omm_comments` 기반 단순 리스트를 유지하되 작성자 이름·시각 포맷팅, `#comments` 해시 자동 스크롤(Defect 패턴)
- **Resubmission 표기**: `is_resubmission && resubmission_seq` 있으면 헤더에 "(R{seq})" 표시 (OmmStatusBadge가 처리)
- **상단 액션**: Back, 새 코멘트로 점프

## 6. 파일 변경

- 수정: `src/pages/docs/DocsOMMDetailPage.tsx` — 전체 재작성
- 참고만 (변경 없음): `useDocsFieldConfig`, `OmmStatusBadge`, `OmmCopyQuantityCell`, `OmmCycleProgress`, `docs_omm`/`omm_comments`/`docs_change_log` 스키마

## 7. 검증

- 사용자 권한별 접속:
  - admin/superuser → 모든 필드 편집 가능
  - d_superuser → 본인 team OMM만 편집, 다른 team은 RLS 에러 메시지
  - user/senior_user → 모든 OMM 편집
  - guest/super_guest → 모든 입력 disabled
- Field Config에서 임의 필드 `is_enabled=false`로 변경 시 상세 페이지에서 즉시 숨김 (realtime 채널 동작)
- Status A→A→A 흐름에서 OmmStatusBadge가 Approved로 갱신
- 코멘트 작성 후 즉시 리스트에 반영
- Raw Data → Open(↗) 클릭 시 정상 진입, Back으로 복귀
