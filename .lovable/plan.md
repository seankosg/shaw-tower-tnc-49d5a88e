## 목적

T&C Executive Dashboard 상단 Tier 1 Summary 카드 중 **"Done"** 카드를 클릭하면 T2가 완료된 subtest 목록(Raw Data) 화면으로 이동하도록 합니다.

## 현재 상태

`src/pages/DashboardPage.tsx` line 303의 Done 카드는 클릭 핸들러가 없어 비활성 상태입니다.

```tsx
<KpiCard ... label="Done" value={kpis.totalDone.toLocaleString()} sub="T2 completed" />
```

같은 페이지의 T2 StageCard(line 323)는 이미 `goSubtests({ t2_status: 'Done' })`로 이동 처리하고 있습니다 (Done 정의와 동일).

## 변경 내용

### `src/pages/DashboardPage.tsx`

Done KpiCard에 `onClick={() => goSubtests({ t2_status: 'Done' })}` 추가.

```tsx
<KpiCard
  icon={<CheckCircle2 className="h-6 w-6" style={{ color: STATUS_COLORS.Done }} />}
  label="Done"
  value={kpis.totalDone.toLocaleString()}
  sub="T2 completed"
  onClick={() => goSubtests({ t2_status: 'Done' })}
/>
```

`KpiCard`는 `onClick`이 있을 때 cursor-pointer hover 효과를 자동 적용하므로 다른 변경은 불필요합니다. `goSubtests`는 현재 적용된 team 필터도 자동 보존합니다.

## 검증

1. 대시보드에서 Done 카드 hover 시 포인터 커서 표시
2. 클릭 시 `/tc/raw-data?t2_status=Done` (필요 시 team 파라미터 포함)으로 이동
3. Raw Data 화면에서 T2 Status가 Done인 subtest만 필터링되어 보여야 함
