## 목표

도면이 어떤 차수에서든 Approval Status = `A` (승인) 에 도달하면 **종결(Closed)** 로 간주하여:
1. **Raw Data 표 / 상세 페이지에서 행 전체를 회색(muted) 톤으로** 표시
2. **A 이후 차수의 일정/상태 데이터를 삭제** (DB 에서 비움)

현재 `computeIsClosed()` 헬퍼는 이미 존재하지만 UI 색상 처리·후속 차수 정리에는 사용되지 않고 있음.

---

## 1) 회색 종결 표시

### Raw Data 행 (`src/pages/docs/DocsRawDataPage.tsx`)

- `renderRowClass()` 와 `stickyBgFor()` 에 `is_closed` 분기 추가
  - 행 전체에 `text-muted-foreground opacity-60` 적용
  - sticky 셀 배경을 `hsl(var(--muted) / 0.5)` 로
  - 단, hover 시는 기존 hover 톤이 우선
- `augmentedItems` 에 `is_closed: computeIsClosed(r)` 도 함께 derive

### Cycle Progress pip (`src/components/docs/DocsCycleProgress.tsx`)

- `overall === 'A'` 일 때 컨테이너에 `opacity-60 grayscale` 추가 → 종결 시각적 구분 강화

### 상세 페이지 (`src/pages/docs/DocsDrawingDetailPage.tsx`)

- 헤더 영역(Card 또는 최상단 컨테이너) 에 `computeIsClosed(form)` 시 `bg-muted/40 text-muted-foreground` 톤 적용
- Overall 배지 옆에 `Closed` 라벨 추가

---

## 2) A 이후 차수 일정 자동 정리

### 정책

- Cycle 1 status = A → cycle 2, 3 의 모든 날짜/상태 필드 = `null`
- Cycle 2 status = A → cycle 3 의 모든 필드 = `null`
- Cycle 3 status = A → 변경 없음
- 정리 대상 필드 (차수별):
  - `subN_planned_date`, `subN_submission_date`, `subN_approval_date`
  - `subN_actual_response_date`, `subN_approval_status`

### 적용 지점 (3곳)

#### (a) 상세 페이지 저장 시 (`DocsDrawingDetailPage.tsx`)

- 저장 직전 `payload` 에 정리 로직 적용:
  ```ts
  if (normalizeApprovalStatus(payload.sub1_approval_status) === 'A') {
    clearCycle(payload, 2); clearCycle(payload, 3);
  } else if (normalizeApprovalStatus(payload.sub2_approval_status) === 'A') {
    clearCycle(payload, 3);
  }
  ```
- 정리 결과로 변경되는 필드도 `docs_change_log` 에 `change_source = 'auto_close_cleanup'` 으로 기록

#### (b) Raw Data 일괄 편집 시 (`src/lib/bulk-edit.ts` / `DocsBulkEditBar.tsx`)

- `subN_approval_status` 를 'A' 로 일괄 변경하는 경우, 동일 정리 로직을 클라이언트에서 row 별로 적용 후 update

#### (c) Import 파서 (`src/lib/docs-import-parser.ts`)

- 행 정규화 마지막 단계에서 동일 헬퍼 호출 → A 이후 차수 데이터가 잘못 들어와도 무시되어 DB 에 빈 값으로 저장
- 이로써 향후 신규 import 도 일관성 보장

### 신규 헬퍼 (`src/lib/docs-status.ts`)

```ts
export function clearCyclesAfterClosure<T extends DrawingForStatus>(d: T): T;
// returns shallow-cloned object with sub2/sub3 fields nulled where appropriate.
// Idempotent. No-op if no 'A' present.
```

이 헬퍼를 (a)(b)(c) 모두에서 재사용.

### 기존 데이터 일회성 정리 (선택)

- 마이그레이션은 만들지 않음. 기존 데이터는 사용자가 다음 import / 저장 시 자연 정리되도록 함.
  - 이유: 의도치 않은 데이터 손실 방지, 사용자가 먼저 데이터 검증 가능
- 사용자가 원하면 별도 요청 시 일회성 정리 SQL 을 실행

---

## 변경 파일

- `src/lib/docs-status.ts` — `clearCyclesAfterClosure()` 헬퍼 추가
- `src/pages/docs/DocsRawDataPage.tsx` — `is_closed` derive + 행 회색 처리
- `src/components/docs/DocsCycleProgress.tsx` — overall=A 시 opacity/grayscale
- `src/pages/docs/DocsDrawingDetailPage.tsx` — 카드 회색 톤, 저장 전 cleanup, change_log 기록
- `src/lib/bulk-edit.ts` — bulk update 시 cleanup
- `src/lib/docs-import-parser.ts` — 파싱 끝에 cleanup 호출

DB 스키마 변경 없음. 기존 데이터 자동 마이그레이션 없음.
