## 문제 정의
현재 보이는 문제는 "정렬 상태"가 아니라, Defect Raw Data의 좌측 고정 컬럼 영역과 우측 본문 영역이 서로 다른 스크롤 좌표계를 쓰게 되면서 같은 레코드가 서로 다른 Y 위치에 렌더링되는 것입니다. 그래서 사용자가 보기에는 같은 행이 어긋나고, 지금 스크린샷처럼 좌측이 비정상적으로 비어 보이거나 정렬이 더 나빠진 것처럼 보입니다.

## Do I know what the issue is?
Yes.

## 정확한 근본 원인
1. `DefectRawDataPage.tsx`에서 우측 본문 스크롤(`tableRef.current.scrollTop`)을 좌측의 `frozenPaneRef`에 그대로 복사하고 있습니다.
2. 그런데 현재 Defect 쪽 좌측 영역은 이전 수정으로 인해 다음 구조로 바뀌어 있습니다.

```text
frozenPaneRef (scrollTop이 적용되는 바깥 wrapper)
├─ 좌측 헤더 테이블
├─ 16px spacer
└─ 실제 좌측 바디 테이블 컨테이너
```

3. 즉, 스크롤을 맞춰야 하는 대상은 "좌측 바디"인데, 실제로는 "헤더 + spacer + 바디를 모두 감싼 바깥 wrapper"에 scrollTop을 주고 있습니다.
4. 반면 우측은 헤더와 상단 가로 스크롤바가 body scroll 영역 바깥에 있고, 실제 scrollTop은 body에만 적용됩니다.
5. 이 구조 비대칭 때문에 좌우가 같은 `scrollTop` 값을 받아도 같은 위치를 가리키지 않습니다. 이게 이번에 더 악화된 직접 원인입니다.
6. 저장된 scroll 위치를 재진입 시 복원하는 로직까지 있어서, 구조가 틀린 상태에서는 페이지 진입 직후부터 mismatch가 더 크게 드러납니다.

정리하면, 현재 문제의 핵심은 "정렬 알고리즘"이 아니라 "스크롤 동기화 대상이 잘못된 구조적 버그"입니다. 이전에 손본 sorting/localStorage 이슈는 부차적이고, 지금 스크린샷의 어긋남을 직접 만든 원인은 아닙니다.

## 수정 계획
1. `DefectRawTableView`의 좌측 frozen 영역에 `frozenBodyRef`를 별도로 두고, 우측 body scroll과 동기화되는 대상은 이 `frozenBodyRef`만 사용하도록 변경합니다.
2. 좌측 헤더와 spacer는 고정 레이어로 두고, scrollTop 적용 대상에서 완전히 분리합니다.
3. 좌우 body의 DOM 구조를 최대한 동일하게 맞춥니다.
   - 동일한 virtual padding 위치
   - 동일한 row height/style
   - 동일한 top offset 처리
4. 현재처럼 바깥 wrapper에 scrollTop을 주는 방식은 제거합니다. 이 부분이 이번 악화의 핵심이므로 반드시 되돌립니다.
5. scroll restore는 새 구조 기준으로 다시 맞춥니다.
   - body ref가 준비된 뒤에만 복원
   - 필요하면 레이아웃 버전 키를 둬서 기존 잘못 저장된 scroll 값이 새 구조에 그대로 적용되지 않게 차단
6. sorting/drilldown 로직은 유지하되, 행 정렬 문제와 분리해서 검증합니다. 즉 이번 수정의 1차 목표는 "같은 행이 같은 높이와 같은 위치에 보이는 것"입니다.

## 구현 범위
- `src/pages/DefectRawDataPage.tsx`
- 필요 시 동일 파일 내부 `DefectRawTableView` 구조 정리

## 기대 결과
- 좌측 고정 컬럼과 우측 본문이 끝까지 같은 행을 가리킴
- 스크롤 중간/하단으로 내려가도 행 mismatch가 재발하지 않음
- 재진입 시에도 저장된 scroll 때문에 좌측이 비어 보이거나 밀리는 현상이 사라짐
- 대시보드 진입 필터와 정렬 상태는 별도 이슈로 유지되더라도, 적어도 행 정렬 자체는 안정적으로 맞음

## 검증 항목
- `/defects/raw-data` 직접 진입
- Dashboard 드릴다운 진입
- 중간/하단 scroll 후 재진입
- sort/filter 적용 상태에서 좌우 행 일치 여부
- 상단 가로 스크롤바 사용 시 header/body/frozen 동기화

승인되면 이번에는 추측성 수정이 아니라, 잘못된 scroll sync 대상 자체를 바로잡는 방식으로 고치겠습니다.