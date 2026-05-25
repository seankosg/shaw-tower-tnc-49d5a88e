## 확인 결과
- 업로드한 `SHAW_Report_2026-05-25_3.pptx`를 파싱해보니, **Slide 2는 여전히 `OMM Draft Submitted 60.4%`**, 반면 **Slide 11은 `Final Submission 100.0%`로 정상 반영**되어 있습니다.
- 즉, **데이터 자체는 `final_actual_date` 기준으로 계산되고 있고**, 문제는 **Slide 2 대시보드 렌더링 결과만 예전 산출물이 남는 상태**로 보입니다.

## 코드 경로 조사 결과
### 1) Slide 2 생성 경로
- `src/lib/ppt-builder.ts`의 `buildDashboard()`가 Slide 2를 생성합니다.
- 현재 코드에는 이미 아래처럼 반영되어 있습니다.
  - `docsKPI.omm.pcts['final_actual_date'] ?? 0`
  - 라벨: `OMM Final Submission`

### 2) PPT export 호출 경로
- `src/components/report/PptExportCard.tsx`는 `buildPpt`를 **직접 `@/lib/ppt-builder`에서 import**해서 사용합니다.
- 즉, export는 `report-builder.ts`의 별도 슬라이드 렌더러나 Storage의 `ppt-builder.ts` active 버전을 사용하지 않습니다.

### 3) 다른 우회 경로 여부
- `report-builder.ts`는 **데이터 집계 전용**이며, Slide 2 문구를 직접 그리지 않습니다.
- `slide_text_overrides`는 일부 텍스트 토큰용인데, 현재 Slide 2의 OMM 카드 라벨을 덮어쓰는 경로는 확인되지 않았습니다.
- `postProcessXml()`도 차트 XML 후처리만 하며 `Draft Submitted`/`Final Submission` 문자열 치환 로직은 없습니다.
- custom slide 경로도 있으나, Slide 2 `dashboard`는 built-in runner를 탑니다.

## 현재 판단
- **저장소 내 다른 코드 경로가 Slide 2를 따로 생성하는 정황은 없습니다.**
- 가장 가능성이 높은 원인은 **브라우저가 이전 번들의 `ppt-builder.ts`를 계속 사용해 PPT를 생성한 경우**입니다.

## 승인 후 진행할 작업
1. **번들/캐시 원인 확정**
   - dev-server 로그와 현재 preview 번들 상태를 확인해, 최신 `ppt-builder.ts`가 실제 preview에 반영됐는지 검증합니다.
2. **재발 방지용 검증 지점 추가**
   - 필요 시 Slide 2 대시보드 OMM 라벨/값에 대한 간단한 런타임 검증 또는 식별 가능한 버전 마커를 추가해, 다시 생성 시 어떤 코드가 탔는지 바로 확인 가능하게 만듭니다.
3. **최소 수정 적용**
   - 캐시/번들 문제라면 강제 재반영이 되도록 최소 범위에서 조치합니다.
4. **생성본 재검증**
   - 새 PPT를 생성한 뒤 Slide 2와 Slide 11을 다시 대조해 동일 기준(`Final Submission`)으로 나오는지 확인합니다.

## 기술 메모
- 조사상 실제 export 경로는:
```text
PptExportCard.tsx
  -> buildPpt() from src/lib/ppt-builder.ts
    -> buildDashboard()  // Slide 2
    -> buildDocsSnapshot() // Slide 11
```
- 따라서 **Slide 11은 맞고 Slide 2만 틀리다면, 코드 분기 문제보다는 stale bundle 가능성이 더 큽니다.**