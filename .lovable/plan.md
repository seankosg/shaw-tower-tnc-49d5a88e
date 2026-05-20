# Daily Default Notice — Phase 2 (영문 매핑 엔진 + A4 Preview)

Phase 1에서 동적 스키마·입력 폼·자동저장이 완성되었으므로, Phase 2는 입력값을 **영문 통보문**으로 변환하는 매핑 엔진과 A4 미리보기를 추가합니다.

## 핵심 설계 원칙

- **매핑 룰도 DB 기반**: 새 필드가 추가되거나 영문 문구를 수정해도 코드 배포 없이 admin이 편집 가능.
- **템플릿 + 조건식**: 각 룰은 `condition`(언제 출력할지) + `template`(무엇을 출력할지). 템플릿은 `{{field_key}}` / `{{computed.xxx}}` 치환.
- **섹션·순서 보존**: 룰은 `ddn_sections` + `display_order`로 정렬되어 통보문 본문 순서가 입력 폼과 동일.
- **결정성**: 같은 inputs + 같은 룰셋 → 항상 같은 출력 HTML. 미리보기와 최종 DOCX가 일치.

## 범위 (Phase 2)

- `ddn_mapping_rules` 테이블 + RLS + 시드 (PART B §1~§8 영문 표준 문장 80~120개).
- 매핑 엔진 `src/lib/ddn/mapping-engine.ts`: inputs + schema + rules + settings → 섹션별 paragraphs.
- A4 Preview 페이지 `/ddn/preview`: serif(예: Source Serif Pro) + Letter-no 헤더 + 섹션 구조 렌더.
- Settings에 **Mapping Rules Editor** 탭 추가: 룰별 condition·template·section·display_order 인라인 편집.
- 입력 페이지에 "Preview" 빠른 이동 버튼.

## 매핑 룰 데이터 모델

```text
ddn_mapping_rules
  id              uuid PK
  rule_key        text UNIQUE          -- 'sec1.pm_absence_line','sec3.ncr_open_summary', ...
  section_id      text FK → ddn_sections
  display_order   int                  -- 섹션 내 출력 순서
  condition       jsonb                -- 평가 트리 (아래 DSL 참조)
  template        text                 -- 영문 본문 ({{field_key}} 치환)
  style           text                 -- 'paragraph'|'bullet'|'heading'|'table_row'
  notes           text                 -- 편집자 메모
  is_active       bool
  updated_at      timestamptz
```

### Condition DSL (jsonb)

단순/조합이 모두 가능한 트리 구조:

```jsonc
// 항상 출력
{ "type": "always" }

// 단일 비교
{ "type": "eq",       "field": "sec1.pm_attended", "value": "N" }
{ "type": "neq",      "field": "sec1.pm_time",     "value": "" }
{ "type": "gt",       "field": "sec3.ncr_open",    "value": 0 }
{ "type": "contains", "field": "sec1.hdec_substitutes", "value": "supervision_inspection" }
{ "type": "exists",   "field": "sec2.delayed_items" }    // 배열 길이 > 0 또는 truthy

// 조합
{ "type": "and", "of": [ ... ] }
{ "type": "or",  "of": [ ... ] }
{ "type": "not", "of":   ... }
```

평가는 `src/lib/ddn/mapping-engine.ts`의 `evaluateCondition(cond, inputs, computed)`.

### 템플릿 치환

- `{{field_key}}` — `inputs[field_key]` 값 (string·number·date 자동 포맷).
- `{{computed.key}}` — Phase 1 computed.ts 결과.
- `{{settings.key}}` — `ddn_settings` 값.
- `{{date:field_key}}` — ISO 날짜 → `21 May 2026` 포맷.
- `{{list:field_key:label_map}}` — checkbox_multi 배열 → 사람이 읽는 영문 라벨 콤마 결합 (옵션의 `label_en` 사용).
- `{{loop:field_key}} ... {{name}} ... {{/loop}}` — `repeatable_group` 반복 (예: §2 지연 항목 리스트).

미정의 키는 빈 문자열로 렌더하고 디버그 패널에 경고 표시.

## 시드 룰 예시

```text
rule_key                    section  cond                                 template
─────────────────────────── ──────── ──────────────────────────────────── ───────────────────────────────
sec1.pm_absence            sec1     eq sec1.pm_attended N                 PM was absent again on {{date:entry_date}} (Day {{day_n}}).
sec1.hdec_substitutes      sec1     exists sec1.hdec_substitutes          HDEC took over the following PM duties: {{list:sec1.hdec_substitutes}}.
sec2.delay_intro           sec2     gt computed.delay_days 0              Project completion is delayed by {{computed.delay_days}} days against the contractual date {{date:settings.contract_completion_date}}.
sec2.delayed_items_loop    sec2     exists sec2.delayed_items             {{loop:sec2.delayed_items}}- {{name}} ({{list:reasons}}){{/loop}}
sec3.ncr_open              sec3     gt sec3.ncr_open 0                    {{sec3.ncr_open}} NCR(s) remain open as of today.
sec6.rto_cctv              sec6     contains sec6.rto_categories cctv     RTO covered CCTV system functional test on {{date:entry_date}}.
...
```

전체 ~100개를 마이그레이션에서 시드.

## 매핑 엔진 흐름

```text
inputs + settings + schema
        │
        ▼
  computed.ts (Phase 1) → computed 맵
        │
        ▼
  rules 정렬: section.display_order → rule.display_order
        │
        ▼
  각 rule: evaluateCondition(...) === true 일 때만
        │
        ▼
  render(template, scope) → HTML 문단/리스트/표 row
        │
        ▼
  섹션별 그룹 → A4 HTML
```

반환 타입:
```ts
interface RenderedLetter {
  letterNo: string;
  date: string;
  dayN: number | null;
  sections: { id: string; titleEn: string; blocks: RenderedBlock[] }[];
  warnings: string[];          // 미정의 변수, 조건 평가 오류
}
type RenderedBlock =
  | { kind: 'paragraph'; html: string; ruleKey: string }
  | { kind: 'bullet'; items: string[]; ruleKey: string }
  | { kind: 'heading'; text: string; ruleKey: string };
```

## UI

### `/ddn/preview`
- 상단 toolbar: 날짜 picker(기본 today), `Day N`, status 뱃지, "Open Editor" 버튼.
- 본문: A4 비율(`max-w-[210mm]`) + serif 폰트 + 1인치 마진.
- 헤더 블록: `Ref: {{letterNo}}`, `Date: {{date}}`, 주소(고정), `Subject: Daily Default Notice — Day {{dayN}}`.
- 섹션: §1~§8 영문 제목 + 매핑된 paragraphs.
- 우측 사이드 패널(접이식): warnings, 사용된 룰 ID 리스트, "왜 안 나왔지?" 디버그.
- 인쇄 친화 CSS (`@media print { body { background:white } }`) — DOCX는 Phase 3.

### `/ddn/settings` — Mapping Rules 탭
- 섹션 드롭다운 → 룰 테이블 (rule_key, condition 요약, template preview, order).
- 행 클릭 → 우측 패널에서 편집:
  - condition: JSON 에디터(monaco-mini 또는 textarea + 유효성 검증).
  - template: textarea + 사용 가능한 변수 헬퍼 ("Insert {{field_key}}" 드롭다운).
  - section_id, display_order, style, is_active.
  - "Test render" 버튼: 현재 `entry_date`의 inputs로 즉시 렌더해서 결과 미리보기.
- 신규 룰 추가 / soft-delete (is_active=false).

## RLS

`ddn_mapping_rules`:
- SELECT: 인증 사용자 전원.
- INSERT/UPDATE/DELETE: `has_role(uid, 'admin')`만.

## 작업 순서

1. **migration**: `ddn_mapping_rules` + RLS + `updated_at` 트리거 + 시드 (PART B 영문 표준 문장 ~100개).
2. `src/lib/ddn/mapping-types.ts` — Condition·Rule·RenderedBlock 타입.
3. `src/lib/ddn/mapping-engine.ts` — evaluateCondition + renderTemplate + buildLetter.
4. `src/lib/ddn/mapping-cache.ts` — react-query rules fetch.
5. `src/pages/ddn/DdnPreviewPage.tsx` — A4 렌더 + 디버그 패널.
6. `src/components/ddn/MappingRulesEditor.tsx` + Settings 탭 통합.
7. 입력 페이지 → "Preview" 빠른 이동 버튼.
8. 수동 검증: 입력 → preview → settings에서 룰 수정 → preview 재확인.

## Phase 3 (참고)

- DOCX 생성 (`docx` lib, `RenderedBlock` → docx Paragraph/Run 변환).
- Lovable Cloud Storage `daily-notices` 버킷 업로드.
- History 페이지: 필터 + ZIP 일괄 다운로드.
- Schema Editor 확장: 필드 신규 추가/삭제, 수식 DSL.
