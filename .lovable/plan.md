## 확인 결과
Raw Data 테이블들에는 내부 세로 스크롤 자체는 있습니다. 다만 공통으로 `scrollbar-hide` 클래스가 적용되어 있어서 **스크롤은 되지만 스크롤바는 보이지 않게** 되어 있습니다.

### 영향 받는 페이지
- `src/pages/SubtestList.tsx:2018`
- `src/pages/DefectRawDataPage.tsx:1576`
- `src/pages/docs/DocsRawDataPage.tsx:1148`
- `src/pages/docs/DocsOMMRawDataPage.tsx:1450`
- `src/pages/docs/DocsWarrantyRawDataPage.tsx:1320`

### 숨김 원인
`src/index.css:121-126`
```css
.scrollbar-hide {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

## 수정 계획
1. Raw Data 테이블 스크롤 컨테이너들에서 `scrollbar-hide` 제거
2. 세로 스크롤바가 항상 자리 차지를 하도록 `scrollbar-gutter: stable` 적용 검토
3. 각 Raw Data 페이지에서 테이블 내부 세로 스크롤바가 실제로 보이는지 확인

## 기술 메모
- 현재 구조는 `max-h-[calc(100vh-...)] + overflow-auto`라서 내부 스크롤은 정상입니다.
- 문제는 기능 부재가 아니라 **의도된 숨김 스타일**입니다.
- Spare Part Raw Data는 별도 구조라 이번 이슈와는 조금 다르게 동작합니다.

승인해주시면 스크롤바가 실제로 보이도록 반영하겠습니다.