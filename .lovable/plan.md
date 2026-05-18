# PPT 빌더 정렬 — REF 슬라이드와 일치시키기

업로드한 REF .pptx 3장(Dashboard, Close Out Documents, Punch List)을 기준으로 `src/lib/ppt-builder.ts`의 해당 3개 슬라이드 빌더를 수정합니다.

## 가정

"마지막 슬라이드의 ABD 카드"는 REF 3장 중 Punch List 슬라이드에는 ABD 카드가 없으므로, ABD 카드가 등장하는 **Close Out Documents 슬라이드(REF 2장째)**의 ABD 카드로 해석했습니다. 다른 의도였다면 알려주세요.

---

## 1) `buildDashboard` (슬라이드 02) — `Close Out Document` / `Punch List` 카드 조정

**Close Out Document 카드 (좌하단)**
- 현재 6행 → REF는 4행. 다음 4개만 표시:
  1. `ABD Submitted` — `abdSubPct`, cyan
  2. `OMM Draft Submitted` — `ommSubPct`, purple
  3. `Warranty Final` — `warFinal`, amber/green
  4. `Spare Delivery` — `spDel`, magenta/green
- 행 간격 `+0.45`로 늘려 빈 공간 흡수 (현재 `+0.36`).

**Punch List 카드 (우하단)**
- 타임라인 라벨을 `MC Date` → `SC Date`로 통일 (REF와 일치).
- 타임라인 3행(Within / Beyond / No Plan) → **2행**(`Within SC Date · N items`, `Beyond · N items`)으로 축소. `No Plan` 분기·렌더 코드 제거.
- 미니 상태카드 3개(Completed/In Progress/Not Started)는 유지.

## 2) `buildDocsSnapshot` (슬라이드 11) — ABD 카드에 진도율 바차트 추가

REF의 OMM/Warranty/Spare Parts 카드처럼 ABD 카드의 각 행에도 진도율 바를 표시. 단위는 `dwgs` 카운트를 유지하되, 옆에 퍼센트 기반의 바를 함께 렌더.

- ABD 행 구성을 3행으로 축소(REF와 일치):
  1. `Submitted` — `abdSub` dwgs, bar = `docsKPI.abd.pcts['sub1_submission_date']`, color `C.cyan`
  2. `Under Review` — `abdUr` dwgs, bar = `abdUr / total * 100`, color `C.stageOfficial`
  3. `Not Submitted` — `abdNs` dwgs, bar = `abdNs / total * 100`, color `C.magentaBright`
- 기존 `Approved` 행은 제거(REF에 없음). 색상 결정 로직(`abdApvPct`)은 헤더 stripe accent에만 활용하거나 제거.
- 렌더링: 기존 `kpiRow` 다음 줄에 `barRow(...)`를 ABD에도 호출하도록 `isPct` 분기 대신 항상 바를 그리되, ABD는 값 텍스트가 `count + " dwgs"` 형태가 되도록 `kpiRow` 시그니처/호출에서 `unit`/`color`만 조정.

## 3) `buildPunchSnapshot` (슬라이드 12) — 디테일 리스트 카드 제거

REF는 상단 3개 히어로 카드(Completion / Weighted Actual / Beyond SC)만 표시하고 그 아래는 비어 있음. 현재는 그 아래에 Status/Risk 2개 리스트 카드를 그리고 있으므로:

- `drawListCard` 호출 및 `statusRows`/`riskRows`/`listY`/`listH` 등 디테일 섹션 블록을 모두 제거.
- 헤더·헤드라인·3 히어로 카드·푸터만 남김. (필요 시 `latest`/`risk` 등 미사용 참조 정리.)

## 4) 회귀 검증

- 위 변경 후 다시 PPT를 생성하여 LibreOffice로 PDF→이미지 변환하고 슬라이드 2/11/12를 시각 검수:
  - 텍스트 겹침 없음, 카드 경계 안에 모든 요소가 위치
  - ABD 카드 3행 + 바차트가 OMM/Warranty/Spare Parts와 시각적으로 일관
  - Punch 슬라이드 하단 여백이 REF처럼 비어 있음

## Technical notes

- 변경 파일: `src/lib/ppt-builder.ts` 만 수정. 다른 슬라이드(T&C, Defect 계열)는 손대지 않음.
- 데이터 모델(`DocsKPI`, `PunchKPI`)이나 데이터 페치 로직은 변경하지 않음 — 이미 필요한 필드 모두 제공됨.
- `progressRow`는 그대로 재사용. `kpiRow`/`barRow`는 ABD 카드에서 항상 바를 그리도록 호출 패턴만 조정.
- ABD 바의 분모는 `docsKPI.abd.total`로 통일하여 3행 합이 100%가 되도록 함.
