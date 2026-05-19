# PPT "연결된 파일을 사용할 수 없습니다" 오류 수정

## 증상
PowerPoint에서 차트 → "Excel에서 데이터 편집" 클릭 시:
> "연결된 파일을 사용할 수 없습니다. 연결된 파일이 이동되었거나 저장되지 않은 경우 이 오류가 발생할 수 있습니다."

이는 PowerPoint가 차트 데이터를 **임베드(embed)** 가 아니라 **외부 링크(link)** 로 인식하고 있다는 의미입니다.

## 원인 가설
이전 수정에서 임베드된 xlsx 자체는 복구했지만, **차트와 xlsx를 연결하는 관계 파일에 문제가 남아있을 가능성**이 높습니다:

1. **`ppt/charts/_rels/chartN.xml.rels`** 에서 xlsx 임베드 관계의 `TargetMode="External"` 속성이 잘못 설정됨
   - 임베드는 `TargetMode` 속성 자체가 없어야 함 (기본값 Internal)
2. **`<c:externalData>`** 블록의 `<c:autoUpdate val="1"/>` 가 링크 동작을 유도
   - val="0"으로 강제 또는 통째 정합성 점검
3. xlsx Target 경로가 `../embeddings/...` 가 아닌 절대/외부 경로로 기재됨

## 작업 단계

### 1. 진단 스크립트 작성 (`scripts/inspect-ppt-chart-rels.ts`)
- 최근 생성된 PPT의 ZIP을 열어 다음을 출력:
  - `ppt/charts/chart*.xml` 내 `<c:externalData>`, `<c:autoUpdate>` 존재 여부 / 값
  - `ppt/charts/_rels/chart*.xml.rels` 의 각 Relationship Type, Target, TargetMode
  - `[Content_Types].xml` 의 xlsx Default/Override 등록 여부
- 어떤 항목이 "External"로 잘못 표시되어 있는지 정확히 식별

### 2. `src/lib/ppt-builder.ts` 의 `postProcessXml` 확장
신규 후처리 단계 추가:

**A. 차트 rels 정규화** (`ppt/charts/_rels/chart*.xml.rels`)
```ts
// TargetMode="External" 제거 (xlsx 임베드 관계 한정)
rels = rels.replace(
  /(<Relationship\s+[^>]*Type="[^"]*spreadsheetml\.sheet[^"]*"[^>]*?)\s+TargetMode="External"/g,
  '$1'
);
// Target이 절대 URL/file:// 인 경우 ../embeddings/Microsoft_Excel_Worksheet1.xlsx 로 교정
```

**B. 차트 XML 정규화** (`ppt/charts/chart*.xml`)
```ts
// autoUpdate를 0으로 고정 (링크 동작 차단)
xml = xml.replace(
  /<c:autoUpdate val="1"\s*\/>/g,
  '<c:autoUpdate val="0"/>'
);
// externalData 블록이 누락된 경우 임베드 rId를 가리키도록 보강
```

**C. 통합 순서**
```
1) fixEmbeddedWorkbook   (기존, xlsx 내부 복구)
2) normalizeChartRels    (신규, External 모드 제거)
3) normalizeChartXml     (신규, autoUpdate=0)
4) 라인 스타일/컬러 후처리 (기존)
```

### 3. 검증
- 진단 스크립트로 수정 전/후 비교
- 데스크탑 PowerPoint에서 실제 확인:
  - "데이터 편집" 클릭 시 오류 다이얼로그 미발생
  - Excel 임베드 워크북 정상 오픈
  - 값 수정 후 차트 갱신 반영
- LibreOffice에서도 깨지지 않는지 확인

## 영향받는 파일
- 수정: `src/lib/ppt-builder.ts` (`postProcessXml` 확장, 함수 2개 신규 추가)
- 신규(개발용): `scripts/inspect-ppt-chart-rels.ts`

## 트레이드오프
- 후처리 비용 미미 (파일당 ms 단위)
- `autoUpdate=0` 강제는 디자인 의도와 부합 (사용자는 PPT 내부에서 수정 후 차트 갱신을 원함, 외부 파일 자동 갱신을 원하지 않음)

## 사용자 확인
1단계(진단)부터 먼저 진행해 정확한 원인을 식별한 뒤 2단계 수정을 적용하는 것이 안전합니다. 진단 결과를 보고 수정 방향을 확정하는 흐름으로 진행해도 되는지 알려주세요. 즉시 1+2 단계를 한 번에 진행하길 원하시면 그렇게 작업하겠습니다.
