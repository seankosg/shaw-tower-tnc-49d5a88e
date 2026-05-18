# T&C 대시보드 guest 접근 권한 수정

## 배경 점검 결과
- **subtests**: SELECT 정책이 `can_view_subtest(...)` 호출이며, 함수 내부에 `guest` 분기가 없어 false 반환 → guest는 대시보드 데이터 0건
- **defect_items**: SELECT 정책이 `USING (true)`로 모든 인증 사용자 허용 → guest 정상 조회 가능 (수정 불필요)

따라서 이번 작업은 `subtests`의 `can_view_subtest` 함수만 수정합니다.

## 수정 내용
### `can_view_subtest` 함수에 guest 분기 추가
- 기존 흐름에서 `super_guest` 분기 바로 아래에 `guest` 분기를 추가하여 `RETURN true` 처리
- T&C 대시보드 집계 데이터(KPI 카드, 차트)가 guest에게도 표시되도록 허용
- Raw Data 상세 페이지는 라우팅 레벨(`role-permissions.ts`)에서 여전히 super_guest+로 제한되므로 영향 없음

### 변경 후 함수 흐름
```text
admin/superuser    → true
super_guest        → true
guest              → true   ← 추가
hdec/pm_pd/admin   → true
subsub/subcontractor → 자신 관련 행만
그 외              → false
```

## 검증
- guest 계정으로 로그인하여 T&C Dashboard 진입 시 Total Items / Completion Rate / 차트가 정상 표시되는지 확인
- Defect Dashboard는 RLS상 이미 열려 있으므로 별도 수정 없이 정상 표시 확인