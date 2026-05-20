## 원인

`PunchRawDataPage.tsx`의 URL → 필터 하이드레이션 로직은 `DRILLDOWN_PARAMS` 리스트에 있는 파라미터가 URL에 존재할 때만 "대시보드에서 진입(드릴다운)"으로 판단하여 localStorage에 저장된 기존 필터를 무시합니다.

현재 `DRILLDOWN_PARAMS`(385~389행):
```
team, subcontractor, subsub, hdecPic, hdecEng, level, workType,
mainTrade, subTrade, health, ready, completionStatus, itemNo,
dateField, dateStart, dateEnd, critical
```

그러나 Punch Dashboard의 `go(...)` 호출에서 실제로 사용하는 파라미터에는 다음이 포함됩니다:
- `status` (planned_started, actual_started, in_delay, start_delayed, overdue, critical, ready_not_started, wip 등)
- `criticalLevel`
- `pre_eng`
- `blocker`
- `due`
- `start_due`
- `dq`

이 파라미터들은 `DRILLDOWN_PARAMS`에 빠져 있어, 예를 들어 `?status=in_delay`나 `?criticalLevel=mid-High`로 진입하면 `isDrilldown=false`가 되고 localStorage의 기존 컬럼 필터가 그대로 복원되어 결과가 겹칩니다. (Defect/Docs RawData 페이지는 자신들의 모든 드릴다운 키를 리스트에 포함해 동일한 문제를 회피하고 있음 — 예: DefectRawDataPage `status` 포함, DocsRawDataPage `DOCS_DRILLDOWN_PARAMS`)

## 수정 사항

**파일: `src/pages/PunchRawDataPage.tsx` (라인 385~389)**

`DRILLDOWN_PARAMS` 배열에 누락된 Punch 전용 드릴다운 파라미터 추가:

```ts
const DRILLDOWN_PARAMS = [
  'team', 'subcontractor', 'subsub', 'hdecPic', 'hdecEng', 'level', 'workType',
  'mainTrade', 'subTrade', 'health', 'ready', 'completionStatus', 'itemNo',
  'dateField', 'dateStart', 'dateEnd', 'critical',
  // 추가
  'status', 'criticalLevel', 'pre_eng', 'blocker', 'due', 'start_due', 'dq',
];
```

이렇게 하면 대시보드 카드 클릭으로 진입할 때 localStorage 기반 기존 컬럼 필터가 초기화되고, URL의 필터 조건만 적용됩니다. 동시에 사용자가 Raw Data에 직접 진입(파라미터 없음)할 때는 기존 저장 필터가 그대로 복원되어 다른 페이지들과 동일한 UX를 유지합니다.

코드 변경은 이 한 곳뿐이며 다른 로직(필터 적용, localStorage 저장)은 그대로 둡니다.
