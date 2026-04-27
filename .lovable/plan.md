## 목표

4개의 Tier 3 배너 레이아웃을 다음과 같이 변경합니다:

```text
┌──────────────────────────────┐
│ Subtest Overdue              │ ← 좌측 상단 라벨
│                              │
│            89                │ ← 가운데, 매우 크게
│                              │
│                      View >  │
└──────────────────────────────┘
```

- **라벨**: 좌측 상단, 작은 글씨, 톤 색상(destructive/amber)
- **숫자**: 배너 가운데 정렬, 배너 높이/폭에 맞춰 최대한 크게 (`text-5xl` 정도, tabular-nums)
- **View >**: 우측 하단에 그대로 유지
- 설명 문구는 없음

## 라벨 텍스트 (4개)

1. `Subtest Overdue` — `overdueCountAll`
2. `Total Stage Overdue` — `overdueOccurrencesAll`
3. `Subtest At Risk` — `atRiskCountAll`
4. `Total Stage At Risk` — `atRiskOccurrencesAll`

## 변경 파일

### `src/pages/DashboardPage.tsx`

**1. `AlertBanner` 컴포넌트 재구성**:
- 시그니처: `tone`, `value: number`, `label: string`, `onClick` (icon/title/description 제거)
- 내부 구조 (button을 `relative` + `flex flex-col`로):
  - 좌측 상단: `<p class="text-xs font-medium {iconCls}">label</p>`
  - 가운데: `<div class="flex-1 flex items-center justify-center"><span class="text-5xl font-bold tabular-nums {iconCls}">value</span></div>`
  - 우측 하단: `<div class="self-end flex items-center gap-1 text-sm text-muted-foreground">View <ChevronRight/></div>`
- 최소 높이 추가(`min-h-[120px]` 정도)로 숫자가 잘 보이도록 함
- 기존 border/배경 톤(destructive/amber) 유지

**2. 4개 호출부 갱신**: 위 라벨 텍스트로 교체, 아이콘 prop 제거

## 비고

- `AlertTriangle`, `Clock` 아이콘은 더 이상 사용하지 않음 (라벨로 충분히 의미 전달). import는 다른 곳에서도 쓰이면 유지.
- grid 레이아웃 `md:grid-cols-2 xl:grid-cols-4` 유지.
