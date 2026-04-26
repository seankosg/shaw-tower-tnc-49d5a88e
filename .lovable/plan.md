# S-Curve 카드 접기/펼치기 + 댓글 피드 위치 변경

## 변경 사항

### 1. Plan vs Actual — S-Curve 차트 접기/펼치기
- `src/pages/DashboardPage.tsx` 와 `src/pages/DefectDashboardPage.tsx` 의 S-Curve 카드를 **기본 접힌 상태**로 변경
- 카드 헤더(제목 + 컨트롤 영역)는 항상 보임
- 헤더 좌측 제목 옆에 **chevron 토글 버튼** 추가 (▶ / ▼)
- 토글 클릭 시 차트 본문(`CardContent`) 만 표시/숨김
- 헤더 안의 날짜 선택/Daily/Weekly 토글 버튼은 펼쳤을 때만 의미가 있으므로 **펼쳐진 상태에서만 보이게** 처리 (접혔을 땐 숨김)
- 상태는 페이지별 `useState<boolean>(false)` 로 관리 (기본 false = 접힘)
- 사용자 선호 기억을 위해 `localStorage` 에 저장:
  - 키: `dashboard.scurve.open` / `defect-dashboard.scurve.open`

### 2. Recent Comments 피드 위치 이동
- 현재 위치: 페이지 **맨 아래** (Bottom split 카드들 뒤)
- 변경 위치: **S-Curve 카드 바로 아래** (Plan vs Actual Summary 와 Bottom split 사이)
- 두 페이지 동일 적용:
  - `DashboardPage`: `<RecentSubtestComments />` 를 S-Curve `</Card>` 직후로 이동
  - `DefectDashboardPage`: `<RecentDefectComments />` 를 S-Curve `</Card>` 직후로 이동

## 기술 세부

```tsx
const [scurveOpen, setScurveOpen] = useState<boolean>(() => {
  return localStorage.getItem('dashboard.scurve.open') === '1';
});
useEffect(() => {
  localStorage.setItem('dashboard.scurve.open', scurveOpen ? '1' : '0');
}, [scurveOpen]);

<Card>
  <CardHeader className="...">
    <div className="flex items-center gap-2">
      <button onClick={() => setScurveOpen(v => !v)} aria-label="Toggle S-Curve">
        {scurveOpen ? <ChevronDown /> : <ChevronRight />}
      </button>
      <CardTitle>Plan vs Actual — S-Curve</CardTitle>
    </div>
    {scurveOpen && (
      <div className="...controls...">{/* date pickers, day/week toggle */}</div>
    )}
  </CardHeader>
  {scurveOpen && (
    <CardContent>{/* chart */}</CardContent>
  )}
</Card>
```

## 변경 파일
- `src/pages/DashboardPage.tsx`
- `src/pages/DefectDashboardPage.tsx`

신규 컴포넌트는 만들지 않습니다. 기존 `RecentSubtestComments` / `RecentDefectComments` 그대로 사용, 위치만 이동.
