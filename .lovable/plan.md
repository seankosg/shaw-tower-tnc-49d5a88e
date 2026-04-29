# 컬럼 헤더 호버 툴팁 추가

## 목표
좁은 컬럼 너비 때문에 잘리는 헤더 워딩을 마우스 호버 시 전체 텍스트로 보여준다.

## 적용 범위
- `src/pages/DefectRawDataPage.tsx` — `renderHeader` 함수 (line 1288)
- `src/pages/SubtestList.tsx` — `renderHeader` 함수 (line 1497)

## 구현 방식

두 페이지 모두 헤더 라벨은 문자열(`getLabel(field)`)이고 `flexRender`로 렌더링됩니다. 가장 단순하고 안정적인 방법은 **native HTML `title` 속성**을 사용하는 것입니다.

### 접근 1: native `title` 속성 (권장)
- `<TableHead>` 내부의 텍스트 `<span>`에 `title={labelText}` 추가
- 컬럼 라벨은 `header.column.columnDef.header`가 문자열일 때 직접 사용, 객체일 때 컬럼 ID 또는 `getLabel(column.id)`로 fallback
- Progress 같은 그룹 헤더(custom JSX)는 평범한 문자열이 아닐 수 있으므로 안전 처리 필요

### 접근 2: shadcn `Tooltip` 컴포넌트
- 더 예쁜 UI지만, 모든 헤더에 Tooltip wrapper 추가 시 렌더링 비용 증가 (수백 컬럼 × 가상화된 행)
- 헤더 클릭(정렬)/드래그(리사이즈)/필터 드롭다운과의 이벤트 충돌 위험
- → 이번엔 채택하지 않음

### 결정: 접근 1 (native title)
- 비용 0, 충돌 0, 모든 브라우저 지원
- 사용자 경험: ~500ms 호버 후 OS 기본 툴팁 표시 — Excel과 유사한 동작

## 구체적 변경

각 `renderHeader`에서 헤더 텍스트 추출 로직 추가:
```typescript
const headerDef = header.column.columnDef.header;
const headerText = typeof headerDef === 'string' ? headerDef : header.column.id;
```

그리고 텍스트 `<span className="truncate">`에 `title={headerText}` 추가:
```typescript
<span className="truncate" title={headerText}>
  {flexRender(header.column.columnDef.header, header.getContext())}
</span>
```

## 영향 없음
- 정렬/필터/리사이즈 동작 변경 없음
- 레이아웃, 스타일 변경 없음
- 다른 페이지(Dashboard, Schedule 등)는 이번 범위 외 — 추후 동일 패턴으로 확장 가능

## 검증 포인트
- Defect Raw Data: 좁은 컬럼(예: "Subcontractor Issue No")에 호버 시 전체 텍스트 표시 확인
- T&C Subtest List: 동일 동작 확인
- Progress 같은 custom 헤더는 깨지지 않고 컬럼 ID라도 표시되는지 확인
