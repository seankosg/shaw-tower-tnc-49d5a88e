## D-Day 카운트다운 배지 추가 (T&C / Defect 대시보드, 싱가포르 표준시 기준)

목표: **2026-06-15 (SGT, UTC+8)**를 D-Day로 두고, 두 대시보드 헤더 타이틀("T&C Executive Dashboard", "Defect Executive Dashboard") 옆에 카운트다운 배지를 표시. 사용자의 로컬 시간대와 무관하게 항상 싱가포르 시간 자정 기준으로 계산.

---

### 1) 공통 컴포넌트 신규 생성

**파일**: `src/components/shared/DDayBadge.tsx`

- Props: `targetDate: string` (ISO `YYYY-MM-DD`), `label?: string`
- **싱가포르 시간(SGT, UTC+8) 기준 자정으로 잔여 일수 계산** — 사용자 PC 시간대가 KST/UTC/EST 어디든 결과 동일
- 표시 규칙:
  - D-Day 이전: `D-123`
  - D-Day 당일: `D-Day`
  - D-Day 이후: `D+45`

**SGT 기준 일수 계산 핵심 코드**:
```ts
// 현재 시각을 SGT 자정으로 정규화 (사용자 시간대 무관)
function sgtMidnight(date: Date): number {
  // SGT = UTC+8. UTC 시각에 8시간 더한 뒤 day 단위로 floor → SGT 자정의 UTC epoch
  const sgtMs = date.getTime() + 8 * 3600 * 1000;
  const sgtDay = Math.floor(sgtMs / 86400000);
  return sgtDay * 86400000 - 8 * 3600 * 1000; // 다시 UTC epoch로
}

const TARGET = '2026-06-15';
// '2026-06-15T00:00:00+08:00' → SGT 자정의 UTC epoch
const targetMs = Date.parse(`${TARGET}T00:00:00+08:00`);
const todayMs = sgtMidnight(new Date());
const diff = Math.round((targetMs - todayMs) / 86400000);

const text = diff > 0 ? `D-${diff}` : diff === 0 ? 'D-Day' : `D+${-diff}`;
```

- 디자인 — 헤더 `text-2xl font-semibold` 옆에 어울리는 톤:
  - 컨테이너: `inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-semibold leading-none`
  - 색상 톤 (잔여 일수 자동):
    - `> 30일`: `bg-primary/10 text-primary border-primary/30`
    - `8 ~ 30일`: `bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30`
    - `≤ 7일 또는 D-Day`: `bg-destructive/10 text-destructive border-destructive/40 animate-pulse`
    - `D+ (경과)`: `bg-muted text-muted-foreground border-border`
  - 좌측 작은 도트 인디케이터
  - 보조 라벨: `text-[10px] text-muted-foreground font-normal`로 `MC: 15-Jun-2026 (SGT)` 표기
  - 툴팁: `Mechanical Completion target: 2026-06-15 (Singapore Time)`

- 자정 자동 갱신: `setInterval`로 1분마다 재계산 (탭이 백그라운드에서도 SGT 자정 넘어가면 즉시 반영)

### 2) 두 대시보드에 배치

**`src/pages/DashboardPage.tsx` (line 291-292 부근)**
```tsx
<div className="flex flex-wrap items-center justify-between gap-3">
  <div className="flex items-center gap-3 flex-wrap">
    <h1 className="text-2xl font-semibold text-foreground">T&C Executive Dashboard</h1>
    <DDayBadge targetDate={MECHANICAL_COMPLETION_DDAY} />
  </div>
  <div className="flex items-center gap-3">
    {/* 기존 Team filter + at-risk threshold */}
  </div>
</div>
```

**`src/pages/DefectDashboardPage.tsx` (line 183-184 부근)** — 동일 패턴 적용.

### 3) 상수 추출

`src/lib/constants.ts`에 추가:
```ts
/** Mechanical Completion target date (Singapore Time, UTC+8). */
export const MECHANICAL_COMPLETION_DDAY = '2026-06-15';
```
두 페이지에서 import — 향후 D-Day 변경 시 한 곳만 수정.

---

### 영향 범위
- 신규: `src/components/shared/DDayBadge.tsx`
- 수정: `src/pages/DashboardPage.tsx`, `src/pages/DefectDashboardPage.tsx`, `src/lib/constants.ts`
- DB·라우팅·로직 변경 없음, 순수 UI 추가
- **싱가포르 시간 기준 계산** → 한국에서 보든 두바이에서 보든 잔여 일수 동일
- 다크모드 + 반응형 대응
