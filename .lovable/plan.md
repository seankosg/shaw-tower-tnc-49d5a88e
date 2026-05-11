## 확인 결과
- **현재 Field Config의 origin/source 설정은 Raw Data 컬러 헤더와 실제로 연동되어 있지 않습니다.**
- Admin의 **Field Config**에서는 `source_origin`을 수정할 수 있고, 훅(`useDocsFieldConfig`, `useDefectFieldConfig`)도 `getSourceOrigin/getSourceLabel`을 제공합니다.
- 하지만 실제 **Raw Data 테이블 헤더 렌더링**은 모듈별 페이지에서 직접 구현되어 있고, 헤더 배경을 모두 `bg-background` / `hsl(var(--background))`로 고정하고 있습니다.
  - `DocsRawDataPage`
  - `DocsOMMRawDataPage`
  - `DocsWarrantyRawDataPage`
  - `DefectRawDataPage`
- 반대로 **import 컬럼 선택 다이얼로그**에서는 이미 `source_origin`을 읽어 HDEC/Aconex/System 배지를 보여주고 있습니다. 즉, **설정값은 저장되지만 Raw Data 헤더에는 안 쓰이는 반쪽 구현**입니다.

## 왜 모듈마다 같은 확인이 반복되나
- **공통 규칙이 컴포넌트로 추상화되지 않았기 때문**입니다.
- Raw Data 헤더 렌더 함수가 모듈마다 각각 복붙 형태로 존재해서, 한 군데 고쳐도 다른 모듈은 그대로 남습니다.
- 추가로 **T&C 기본 `field_config`는 docs/defect와 달리 `source_origin` 기반 구조가 아예 없습니다.** 그래서 “똑같이” 적용하려면 스키마/관리 UI/훅까지 범위를 명확히 맞춰야 합니다.

## 구현 계획
1. **공통 헤더 origin 스타일 규칙 정리**
   - `hdec / aconex / system`별 헤더 배경/텍스트/보더 토큰을 하나의 공통 helper 또는 컴포넌트로 분리합니다.
   - sticky/frozen column 상태에서도 같은 색이 유지되도록 처리합니다.

2. **Raw Data 4개 모듈을 동일 방식으로 연결**
   - As-Built, OMM, Warranty, Defect의 헤더 렌더러가 `field_name -> source_origin`을 읽어 컬러 헤더를 적용하도록 바꿉니다.
   - 현재 이미 있는 `getSourceOrigin()`을 그대로 사용해 모듈별 규칙 차이를 없앱니다.

3. **중복 헤더 렌더 코드 공통화**
   - 모듈별 `renderHeader` 중복을 공통 컴포넌트/유틸로 묶어, 이후에는 한 번 수정하면 전체 모듈에 동일 반영되게 만듭니다.
   - 정렬 아이콘, 필터 버튼, resize 핸들, sticky shadow는 유지합니다.

4. **적용 범위와 예외 명확화**
   - docs/defect는 즉시 연동 가능.
   - T&C Raw Data까지 같은 컬러 헤더를 원하면, 별도로 `field_config`에 origin 개념을 추가하는 후속 작업 계획을 분리합니다.

## 기술 메모
- 변경 대상은 주로 다음 파일들입니다:
  - `src/pages/docs/DocsRawDataPage.tsx`
  - `src/pages/docs/DocsOMMRawDataPage.tsx`
  - `src/pages/docs/DocsWarrantyRawDataPage.tsx`
  - `src/pages/DefectRawDataPage.tsx`
  - 공통화용 신규 컴포넌트 또는 유틸 1개
- DB 변경 없이 먼저 해결 가능한 범위는 **docs/defect Raw Data 헤더 연동 + 공통화**입니다.
- T&C까지 완전히 같은 체계로 맞추려면 DB/관리화면 확장이 필요합니다.