## QA 결과 — 12장 슬라이드 검토

### 치명적 (반드시 수정)

**[Slide 02] Punch List 카드 — No Plan 텍스트 세로로 깨짐**
- 위치: `src/lib/ppt-builder.ts` L513-515
- 원인: `noPlanW2 = (noPlan / incompleteN) * tlW2` 가 `noPlan=0`일 때 0이 되고, `addText`의 `w: noPlanW2-0.12 = -0.12` (음수 너비) → PowerPoint가 글자 단위 세로 줄바꿈
- 추가: 같은 패턴이 `Within MC Date` (L504) 와 `Beyond` (L510) 에도 존재 (각각 within=0 또는 beyond=0일 때 동일 증상)
- 수정: 각 행의 텍스트 너비를 `Math.max(1.5, barW-0.12)`로 보장하고, 막대 너비가 0/너무 작을 때는 텍스트를 막대 우측에 배치 (또는 행 자체를 숨김)

**[Slide 02] Punch List 타임라인 — "Today/MC Date" 라벨이 막대와 겹침**
- 위치: L487-491
- 원인: `divY` 위 라벨 영역과 막대 첫 행 r1Y 간 간격 부족 (0.05만)
- 수정: r1Y를 `axisY2 + 0.15` 정도로 늘리고 카드 내부 영역 재계산

**[Slide 02] Punch List 카드 하단 — 카드 밖으로 콘텐츠 넘침 ("0"이 카드 밖에 표시)**
- 원인: `tier2H` 대비 row × 3 + gap × 2 가 너무 큼
- 수정: rowH2 0.28→0.24, rowGap2 0.18→0.12 로 축소하거나 카드 높이 증가

**[Slide 12] TOP 3 LATEST 테이블 — 슬라이드 아래로 잘림 (Row 2 footer와 겹침, Row 3 사라짐)**
- 위치: L1280-1316
- 원인: 누적 y 계산 결과 마지막 행이 y=7.64+0.38 → 슬라이드 7.5" 초과. 푸터가 y=7.1
- 수정: hero 카드 영역 또는 list 영역을 축소:
  - `heroH = 2.2 → 1.9`
  - `listH = 2.05 → 1.7`
  - 결과: t3Y ≈ 6.4 → 5.7, 마지막 row 바닥 ≈ 7.3-7.4 → 푸터 7.1과 여전히 충돌. 추가로 row height 0.42→0.30, 박스 h 0.38→0.27, 헤더 t3Y+0.32→t3Y+0.25, 시작 t3Y+0.4→t3Y+0.30 로 압축

### 중대 (수정 권장)

**[Slide 04] 차트 데이터 라벨 겹침 — "+7.6%"와 "77%"가 같은 위치**
- 위치: 차트 어노테이션 (Plan vs Actual)
- 원인: actual end-point label과 plan end-point label이 동일 좌표 근처에 자동 배치
- 수정: 한쪽 라벨에 y-offset을 주거나 (`addText` 위치 조정), `+Δ%` 와 actual `%`를 묶어서 한 줄로 표시

**[Slide 01] 표지 — 우측 하단 footer 텍스트가 장식 원과 겹침**
- 위치: `buildCover` 함수의 footer 영역과 원형 데코
- 수정: footer 텍스트 박스의 y 좌표를 약간 위로 올리거나, 장식 원의 opacity/위치 조정 (z-order는 footer를 마지막에 그리도록)

### 경미 (선택 수정)

**[Slide 03]** 타이틀이 두 줄로 wrap되어 본문 시작이 약간 내려옴 — 카드 영역은 정상. 빈 하단 공간 큼 (정보 부족). 그대로 둬도 무방.

**[Slide 06, 10]** Action Plan 박스의 "Cooperation Requests" 영역 placeholder `[ — ]` 가 비어 보임. 데이터 부재 상태이므로 의도된 동작으로 보임.

**[Slide 11]** ABD 카드만 progress bar 미표시 (다른 3개 카드는 표시). 일관성 위해 bar 추가 또는 다른 카드도 bar 제거 통일.

---

## 수정 범위

위 항목 중 **치명적 3건**과 **중대 2건**을 `src/lib/ppt-builder.ts` 한 파일에서 수정. 다른 파일 영향 없음.

수정 후 재빌드 → 12장 모두 다시 이미지로 렌더링하여 재검증.

## 확인
경미 항목(slide 03 빈 공간, slide 06/10 placeholder, slide 11 ABD bar)은 데이터/디자인 의도 영역이므로 별도 지시 없으면 건드리지 않습니다. 함께 수정 원하시면 알려주세요.
