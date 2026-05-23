## PriorityCard 레이아웃 개편 (시인성 개선)

대상: `src/pages/DefectDashboardPage.tsx`의 `PriorityCard` 컴포넌트 (≈903~965 line). Category Classification & Dispute 섹션 4개 카드(Total/Cat. A/Cat. B/No Cat.) 모두에 적용.

### 새 헤더 레이아웃

```text
┌─────────────────────────────────────────────┐
│ Label (크게, 좌측 최상단)                    │
│ 1,234   [ 12 ]                    [OD 3]    │
│ ─ Completion progress bar ─                  │
│ ─ Closure progress bar ─                     │
└─────────────────────────────────────────────┘
```

1. **Label (Tier 1, 최상단·좌측)**
   - 기존 `text-xs text-muted-foreground` → `text-sm font-semibold text-foreground`
   - 한 줄 단독 배치 (`truncate`)

2. **숫자 (Tier 2, 좌측)**
   - 라벨 바로 아래 줄 좌측
   - 크기 유지: `text-2xl font-bold` + `tabular-nums leading-none`

3. **잔여(Closure 미완료) 칩 (Tier 2, 숫자 바로 오른쪽)**
   - 라벨 없이 **숫자만** 표시 (예: `12`) — `Rem` 단어 제거
   - 스타일: **빨간 테두리 + 흰 바탕 + 빨간 글자**
     - `border border-destructive bg-background text-destructive`
     - 호버: `hover:bg-destructive/10`
     - 비활성(remaining=0): `border-muted bg-background text-muted-foreground/60`
   - 사이즈: `text-[11px] px-1.5 py-0.5 rounded tabular-nums`
   - `title="Closure 미완료 잔여"` 유지 (툴팁으로 의미 전달)
   - 클릭 시 기존 drill-down (`notClosureDone=true`) 유지

4. **OD 칩 (Tier 2, 가장 우측)**
   - 위치 이동: 라벨 옆 → 숫자 줄 가장 오른쪽 (`ml-auto`)
   - 기존 스타일/동작 그대로 유지

### 마크업 구조

```tsx
<CardContent className="flex flex-col gap-2 p-4">
  {/* Tier 1: Label */}
  <p className="text-sm font-semibold text-foreground truncate">{label}</p>

  {/* Tier 2: number + remaining chip + OD chip */}
  <div className="flex items-center gap-2">
    <p className="text-2xl font-bold tabular-nums leading-none">
      {stats.total.toLocaleString()}
    </p>
    <button /* remaining chip - 숫자만, 빨간 테두리+흰 바탕 */>
      {remaining.toLocaleString()}
    </button>
    <button /* OD chip - 기존 스타일 */ className="ml-auto ...">
      OD {stats.overdue.toLocaleString()}
    </button>
  </div>

  {/* Completion / Closure progress (변경 없음) */}
</CardContent>
```

### 범위 외
- 집계 로직, drill-down 라우팅 파라미터, Progress bar 영역, 다른 섹션 카드 디자인 변경 없음.
- 추가 제안 옵션 항목은 반영하지 않음.
