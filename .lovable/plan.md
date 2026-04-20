

## Subtest Master DB → Excel 내보내기 (WYSIWYG) 통합 계획

### 목표
SubtestList 화면에 **현재 보이는 그대로** 엑셀로 내보내기. 대쉬보드 진입(쿼리스트링 필터 적용 포함)도 동일 버튼 하나로 처리.

### 핵심 원칙
- **단일 진실원**: react-table 인스턴스(`getVisibleLeafColumns`, `getSortedRowModel`)에서 직접 추출. 별도 DB 테이블 불필요(어긋남 위험·트래픽·RLS 부담만 증가).
- **영속화**: 이미 `localStorage` 로 사용자별 분리 저장 중 → 추가 인프라 0
- **대쉬보드 연계**: 대쉬보드 클릭 → URL params → SubtestList가 자동으로 필터 변환 → 같은 Export 버튼 사용

### 엑셀 출력 구조
```text
Row 1: SHAW T&C — Subtest Master DB Export                    (14pt 굵게, 병합)
Row 2: Exported: 2026-04-20 14:30 by John Doe (HDEC)          (10pt 회색)
Row 3: Source: Dashboard → Overdue Subtests                   (URL params 자동 추론)
Row 4: Search: "valve"
Row 5: Filters: System=[A,B] · T1 Status=[Done,WIP]
Row 6: Sort: Item No ↑, T1 Planned ↓
Row 7: (빈 줄)
Row 8: [컬럼 헤더 — Field Config display_name 사용, 진한 배경+흰 글씨]
Row 9~: [데이터 행 — 화면 정렬/필터 결과 그대로]
```

**스타일·레이아웃**
- 컬럼 폭: `column.getSize() / 7` 로 px → Excel `wch` 변환
- 행 높이: 헤더 28pt, 데이터 20pt
- **틀고정**: 헤더(Row 8) + 좌측 3개 컬럼 → Excel Freeze Panes (화면 UX와 동일)
- 메타 영역(1~6): 옅은 회색, 테두리 없음

**Source 라인 자동 추론**
| URL param | 표기 |
|---|---|
| `status=overdue` | Dashboard → Overdue Subtests |
| `status=at_risk` | Dashboard → At-Risk Subtests (≤N days) |
| `subcon=X` | Dashboard → Subcontractor: X |
| `subsub=X` | Dashboard → Sub-subcontractor: X |
| `hdec_pic=X` | Dashboard → HDEC PIC: X |
| `system=X` | Dashboard → System: X |
| `t1_status=X` / `t2_status=X` | Dashboard → T1/T2 Status: X |
| (없음) | Subtest Master DB (direct) |

### 셀 값 포맷 (화면과 100% 일치)
| 컬럼 종류 | 출력 |
|---|---|
| 날짜(`*_date`) | `formatDdMmm()` (예: `15-Jan`) |
| `t1_status`/`t2_status` | enum 텍스트 (`Planned`/`WIP`/`Done`/`Hold`) |
| `predecessor_status_raw` | 화면 표기 그대로 |
| `data_source_type` | `DATA_SOURCE_LABELS[v]` |
| `system_code` | join 값 그대로 |
| `updated_at` | `toLocaleDateString()` |
| 기타 | 값 그대로, `null` → `''` |

**헤더명 우선순위**: `field_config.display_name` → `column.columnDef.header` → `column.id`

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/lib/excel-export.ts` (신규) | `exportSubtestsToExcel(ctx)` — 메타블록·헤더·데이터·스타일·틀고정·Source 추론·파일 저장 |
| `src/pages/SubtestList.tsx` | 툴바에 `Export Excel` 버튼 추가, 클릭 시 위 함수 호출 (table, fieldConfig, globalFilter, user, searchParams 전달) |
| `package.json` | `xlsx-js-style` 추가 (셀 스타일링·Freeze Panes 지원, `xlsx` 드롭인 호환) |

### 변경 없음
- `ExportPage` (사용자 지시대로 종합 메뉴 탭 역할 유지)
- `DashboardPage` (URL params 흐름 그대로 사용)
- DB 스키마 / RLS / Edge Function

### 검증 시나리오
1. Field Config에서 컬럼 3개 비활성화 → Export 결과에 해당 컬럼 없음
2. 화면에서 `Status=Done` 필터 → Done 행만 + 메타블록에 `Filters: T1 Status=[Done]`
3. 컬럼 리사이즈 후 Export → Excel 열 너비가 화면 비율과 유사
4. Excel 열기 → 좌측 3개 컬럼 + 헤더 행 틀고정 동작
5. 대쉬보드 "Overdue Subtests" KPI → SubtestList 진입 → Export → Overdue 행만 + Source 라인에 `Dashboard → Overdue Subtests`
6. 대쉬보드 At-Risk 배너 / Pie 슬라이스 / Plan-vs-Actual 그룹 클릭 → 각각 동일 패턴으로 정확 반영
7. 0건 결과 → toast `No rows to export`

### 결론
- 별도 DB 테이블 신설 불필요 — react-table 직접 추출이 화면 일치 보장 측면에서 유일한 정답
- 컬럼 폭/제목/필터 조건은 메타블록 + Excel 셀 스타일·Freeze Panes 로 모두 반영
- 대쉬보드 지연항목 등 모든 진입 경로는 단일 Export 버튼으로 자동 처리 (추가 분기 불필요)
- Export 탭과 완전 분리, 1개 신규 파일 + 1개 페이지 수정 + 1개 패키지 추가로 완료

