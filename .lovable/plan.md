## 문제 정의
지금 문제를 다시 정확히 정의하면, 사용자가 보는 현상은 단순한 "정렬(sort)" 문제가 아니라 Defect Raw Data 테이블의 **행 위치/행 매핑이 신뢰되지 않는 상태**입니다. 이전 수정들이 계속 실패한 이유는 좌우 패널의 스크롤 동기화만 손봤지, 실제로 행의 좌표계를 결정하는 핵심 구조를 바꾸지 않았기 때문입니다.

## Do I know what the issue is?
Yes.

## 확인된 사실
- 현재 코드에서 좌측/우측 행은 제 브라우저 검증 기준으로는 같은 `top`과 같은 `height`를 갖는 구간이 있었습니다.
- 하지만 `DefectRawDataPage.tsx`는 여전히 **가상 스크롤이 `ROW_HEIGHT = 36`을 가정**하고 있고, 실제 브라우저에서 보이는 행 높이는 그보다 더 작게 렌더링되고 있습니다.
- 즉, **좌우 패널끼리만 맞아 보여도, virtualizer가 생각하는 행 높이와 실제 DOM 행 높이가 다르면** 스크롤 위치, 복원된 위치, 중간/하단 구간의 레코드 매핑이 틀어질 수 있습니다.
- 여기에 현재 구조는 **좌측 테이블 / 우측 테이블을 따로 렌더링**하고 있어, 사소한 padding, border, badge 높이, 브라우저 zoom 차이만 있어도 다시 drift가 생길 수 있습니다.

## 정확한 근본 원인
근본 원인은 2개가 겹쳐 있습니다.

1. **가상화 기준 높이와 실제 렌더 높이가 다름**
   - 코드상 virtualizer는 모든 행을 36px로 계산합니다.
   - 실제 DOM은 badge, checkbox, text line-height, browser zoom 조건에 따라 더 낮게 렌더링됩니다.
   - 그래서 스크롤바 총 높이, paddingTop/paddingBottom, scroll restore 기준이 실제 행 위치와 어긋납니다.

2. **한 화면을 두 개의 별도 테이블로 쪼개 놓은 구조 자체가 취약함**
   - 좌측 frozen pane과 우측 scroll pane이 각각 독립적인 table/body/row tree를 가집니다.
   - 현재는 같은 virtualRows를 써도, 브라우저가 각 DOM을 조금이라도 다르게 계산하면 다시 불일치가 생길 수 있습니다.
   - 즉, 지금 구조는 "맞출 수는 있지만 항상 깨질 수 있는 구조"입니다.

정리하면, 질문하신 "양측의 행 높이는 같은가요?"에 대한 답은 **일부 구간에서는 좌우끼리는 같게 보입니다.** 하지만 **그 행 높이가 virtualizer가 가정한 높이와는 다릅니다.** 그래서 지금까지의 수정이 근본 해결이 되지 못한 것입니다.

## 해결 전략
이번에는 scroll sync 미세조정이 아니라, **구조 자체를 바꾸는 방식**으로 해결합니다.

### 1) Defect Raw Data를 단일 테이블 구조로 재구성
- 좌측 frozen / 우측 scroll용으로 테이블을 두 벌 렌더링하는 방식을 제거합니다.
- 하나의 scroll container + 하나의 row tree만 유지합니다.
- 고정 컬럼은 `position: sticky` + `left` offset으로 처리합니다.
- 이렇게 하면 브라우저가 한 행의 높이를 한 번만 계산하므로, 좌우 mismatch가 구조적으로 불가능해집니다.

### 2) 행 높이를 실제로 고정하거나 측정하도록 virtualizer 수정
둘 중 하나로 정리합니다.
- **고정 높이 방식**: 모든 body row/cell을 CSS로 확실히 36px에 맞춥니다.
- **실측 방식**: TanStack Virtual 권장 패턴처럼 `measureElement`를 도입해 실제 행 높이를 virtualizer가 읽도록 바꿉니다.

이번 케이스는 내부 운영용 데이터 그리드이고, single-line/truncate 정책이 이미 강하므로 **고정 높이 방식이 1순위**입니다. 이렇게 하면 scroll geometry가 안정적입니다.

### 3) 행 내부 콘텐츠 높이 통일
- `Badge`, `Checkbox`, `DefectStageProgress`, 일반 text cell의 line-height/padding을 같은 기준으로 맞춥니다.
- 모든 body cell을 single-line + truncate 기준으로 통일합니다.
- 행 높이를 키우는 숨은 요소가 없는지 정리합니다.

### 4) 잘못 저장된 scroll state 무효화
- 현재 저장된 `localStorage` scroll 값은 잘못된 row geometry 기준일 가능성이 큽니다.
- layout version key를 추가해서 새 구조에서는 예전 scroll 복원값을 버리겠습니다.
- drilldown 진입 시에도 새 좌표계만 사용하게 정리합니다.

### 5) 검증 범위 확대
다음 조건을 모두 확인합니다.
- `/defects/raw-data` 직접 진입
- Dashboard 드릴다운 진입
- 상단/중간/하단 scroll
- 필터/정렬 적용 후 재진입
- 사용자와 같은 넓은 데스크톱 뷰 조건
- top scrollbar 사용 시 헤더/본문 정렬 유지

## 구현 범위
- `src/pages/DefectRawDataPage.tsx` 중심 리팩토링
- 필요 시 공통 스타일 보정:
  - `src/components/defects/DefectStatusBadge.tsx`
  - `src/components/defects/DefectStageProgress.tsx`
  - `src/components/ui/badge.tsx`

## 기대 결과
- 좌우 행 정렬 문제를 "동기화"가 아니라 **구조적으로 제거**
- 스크롤 위치와 실제 레코드 매핑 일치
- 재진입 시 blank area / jump / 어긋남 제거
- 브라우저 zoom이나 데이터 내용 차이에 덜 민감한 안정적 테이블

## 기술 메모
```text
현재 구조
[Left table]   +   [Right table]   +   virtual row height guessed as 36px
=> 맞는 것처럼 보여도 언제든 다시 깨질 수 있음

목표 구조
[One table, one row tree, sticky left columns]
=> 브라우저가 한 행 높이를 한 번만 계산
=> 좌우 mismatch 자체가 사라짐
```

TanStack 문서 관점에서도, 현재처럼 실제 행 높이와 virtualizer 추정 높이가 다른 상태는 스크롤 geometry 오류를 만들기 쉽습니다. 이번 수정은 그 지점을 바로잡는 방향입니다.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>