## 목표

Punch Dashboard 헤더에 **HDEC PIC 필터 드롭다운**을 추가하고, 선택값에 따라 **최상단 Tier 서머리 카드(Tier 1·Tier 2 + Status Mix + Summary of Work + 이후 모든 집계)** 가 함께 갱신되도록 한다.

`rows` 한 군데를 필터링해 전체 `useMemo` 체인이 자동 반영되도록 구현(부분 필터는 카드 간 숫자 불일치를 유발하므로 글로벌 적용).

---

## 구현 계획 (`src/pages/PunchDashboardPage.tsx`)

### 1) 마스터 옵션 로드
- `useCommonMasters()` 훅의 `hdecPicOptions` 사용 (Docs/Subtest와 동일 소스: `hdec_pic_master` 테이블).
- 데이터에 존재하지만 마스터에 없는 PIC도 표시하기 위해 `unionWithLegacy(hdecPicOptions, rows.map(r => r.hdec_pic_name))` 적용.

### 2) 필터 상태
```ts
const [picFilter, setPicFilter] = useState<string>('all'); // 'all' | '__empty__' | <pic name>
```
- `'__empty__'` 옵션은 HDEC PIC가 비어있는 행만 필터링.

### 3) 필터 적용
```ts
const filteredRows = useMemo(() => {
  if (picFilter === 'all') return rows;
  if (picFilter === '__empty__') return rows.filter(r => !String(r.hdec_pic_name ?? '').trim());
  return rows.filter(r => (r.hdec_pic_name ?? '') === picFilter);
}, [rows, picFilter]);
```
- 기존의 모든 `useMemo`(`stats`, `matrix`, `recovery`, `dqCounts`, `criticalLevelSummary`, `topSubcons`, `topPics`)의 의존성을 `rows` → `filteredRows`로 변경.

### 4) 헤더 UI
- 우측 상단 버튼 영역(`Open Raw Data` 옆)에 `Select` 추가:
  - placeholder: `HDEC PIC: All`
  - 옵션: `All` / `(empty)` / 각 PIC명
  - 폭 `w-[200px]`, 높이 `h-8`, `text-xs` 스타일로 헤더 톤에 맞춤.
- 부제 텍스트(`{stats.total} items tracked · as of {asOf}`)에 필터가 활성화된 경우 `· filtered by HDEC PIC: <name>` 추가.

### 5) 드릴스루 연동
- `go(qs)` 헬퍼를 수정해 PIC 필터가 활성화되면 `&hdecPic=<encoded name>`을 자동 부착.
- 이미 Punch Raw Data는 `?hdecPic=` 파라미터를 처리(라인 606)하므로 별도 수정 불필요.
- `'__empty__'`는 raw-data에서 EMPTY_TOKEN으로 전달(`hdecPic=__empty__`).

### 6) 영향 범위
- DB / 마이그레이션: 없음
- 다른 페이지: 없음
- 기존 카드/카운트 의미: 동일 (입력 데이터셋만 좁아짐)

---

## 검수 포인트

1. 헤더 드롭다운에 활성 마스터 + 기존 데이터 PIC 합집합이 정렬되어 표시
2. 특정 PIC 선택 시 Tier 1(Completed·Planned·Actual·In Delay), Tier 2(Pre-Eng Blocked·Start Overdue·Completion Overdue·Behind), Status Mix, Summary of Work, Lookahead, Pre-Eng Gates까지 모두 해당 PIC 행만으로 재계산
3. 카드 클릭 시 Raw Data로 이동하면 기존 필터 + `hdecPic=<선택값>`이 모두 적용됨
4. `(empty)` 선택 시 HDEC PIC 미지정 행만 집계
5. `All` 선택 시 기존 동작과 100% 동일
