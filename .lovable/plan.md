## 목적

Defect 393개(planned_completion) / 382개(planned_closure) 누락 원인을 **데이터 변경 없이** 정확히 파악하여, 다음 단계(B 재계획 / 데이터 보완 / 리포트 문구 수정) 결정에 필요한 근거를 만든다.

## DB 조사 결과 (is_active=true, N=5,712)

planned_completion_date 누락 **393건** 분포:

| 카테고리 | 건수 | 의미 |
|---|---|---|
| **A. 미계획 Open** (status=Open, completion/closure_status·계획·실적 모두 NULL) | **332** | Subcon이 계획을 아예 입력 안 한 상태 — 데이터 입력 공백 |
| B. In dispute (분쟁중) | 19 | 책임 협의 중이라 계획 미수립 — 업무 프로세스상 정상 |
| C. 이미 Closed/Work Done인데 계획만 누락 | 23 | 실적 있음·계획 없음 (역추적 가능) |
| D. completion=Done이나 closure 미완 + 계획 누락 | 21 | 작업은 끝났으나 계획 입력 누락 |

팀 분포: Arch ~242, Elec ~67, Mech ~58 (Arch가 압도적).

## 산출물

`/mnt/documents/defect_missing_planned_dates_analysis.md` — 다음을 포함:

1. 393/382 누락의 카테고리 분류표 (위 4유형)
2. 팀×카테고리 매트릭스
3. **샘플 issue_no 목록** (각 카테고리당 10개) — 현장 확인용
4. Top 10 subcontractor / hdec_pic 별 누락 건수 — 책임자 추적용
5. 각 카테고리별 **권장 처리 방향**:
   - A(332): Subcon에 일괄 재계획 요청 → 이후 B 옵션 실행
   - B(19): 분쟁 해소 전까지는 분모에서 제외(soft-exclude) 검토
   - C(23): actual_completion_date를 planned로 백필(backfill) 가능
   - D(21): 동일하게 백필 가능
6. **리포트 영향 시뮬레이션**: 카테고리별로 분모에서 빼거나 백필했을 때 Plan S-curve 최대치가 얼마까지 올라가는지 (예: A만 해결 시 ~98.9%, A+B 시 ~99.2% 등)

## 코드/DB 변경 없음

순수 read-only 조사. 결과 .md 파일만 `/mnt/documents`에 생성하여 사용자가 검토 후 다음 단계(B 재계획 / 데이터 정정 / 리포트 단서 추가) 결정.

## 참고

`defect_items` 테이블만 사용. RLS·스키마 변경 없음. `report-builder.ts`는 수정하지 않음.
