# Admin(VP) 조회 배치 캐싱 + DOC 모듈 일관성 점검

## 1. 캐시 모듈 신규: `src/lib/admin-roles-cache.ts`

전역 모듈 스코프 캐시 + in-flight 배치를 둬서, 같은 페이지 안에서 8개 코멘트 컴포넌트가 모두 로드되어도 `user_roles` 쿼리는 **세션당 1회**만 실행되도록 합니다.

```ts
// adminIds: Set<string> 전체 admin user id
let cache: { ids: Set<string>; at: number } | null = null;
let inflight: Promise<Set<string>> | null = null;
const TTL_MS = 5 * 60_000; // 5분

export async function getAdminUserIds(): Promise<Set<string>>
export async function isAdminAuthorMap(userIds: string[]): Promise<Set<string>>
export function invalidateAdminRolesCache(): void
```

- `getAdminUserIds()`: 캐시 유효(<TTL)면 즉시 반환; 아니면 단일 쿼리 `SELECT user_id FROM user_roles WHERE role='admin'` (전체 admin 수는 매우 적음 → IN 절 없이 전체 페치가 더 효율). 진행 중인 쿼리는 `inflight`로 중복 방지.
- `isAdminAuthorMap(userIds)`: `getAdminUserIds()`의 결과를 받아 `userIds ∩ adminIds`를 반환 — 컴포넌트별로 받는 함수 시그니처는 그대로 유지.
- `invalidateAdminRolesCache()`: 관리자 페이지에서 역할 변경 시 호출 가능 (선택).

### 기존 헬퍼 변경
`src/lib/comment-author-roles.ts`의 `fetchAdminAuthorIds`는 내부 구현을 새 캐시 사용으로 교체 (호출부 변경 없음):

```ts
export async function fetchAdminAuthorIds(userIds: string[]) {
  return isAdminAuthorMap(userIds);
}
```

## 2. 캐시 무효화 트리거 (가벼운 안전장치)

- `src/pages/AdminPage.tsx`(또는 user role 편집 코드 경로)에서 역할 추가/제거 성공 후 `invalidateAdminRolesCache()` 호출. 이미 코멘트 컴포넌트들은 realtime 구독 중이므로 다른 사용자의 권한 변경은 5분 TTL 내에 자연 반영.

## 3. DOC 모듈 VP 강조 일관성 점검

현재 적용 완료된 코멘트 컴포넌트:
- `OmmComments.tsx`, `WarrantyComments.tsx`, `SparePartComments.tsx` ✅
- `DefectComments.tsx`, `SubtestComments.tsx` ✅
- `AllCommentsView.tsx`, `RecentDefectComments.tsx`, `RecentSubtestComments.tsx` ✅

DOC 모듈 중 ABD에는 코멘트 테이블이 없어 코멘트 UI가 존재하지 않음 → 변경 대상 외.

추가로 점검·정리할 항목:
- 세 DOC 코멘트 컴포넌트(Omm/Warranty/SparePart)의 VP 뱃지·좌측 보더 스타일이 동일 클래스(`border-l-4 border-l-primary` + `bg-primary text-primary-foreground` Badge)인지 grep으로 일괄 확인.
- 차이가 있을 경우 동일하게 정렬 (현재 패치 스크립트로 일괄 적용했으므로 동일할 것으로 예상; 검증만).

## 4. 비즈니스 로직 영향

없음. 데이터 페치 횟수만 감소(컴포넌트당 1쿼리 → 세션당 1쿼리). 표시·권한 로직 변경 없음.

## 5. 기대 효과

- 코멘트가 많은 페이지(예: AllCommentsView, Detail 페이지의 코멘트 패널 + Recent 피드 동시)에서 `user_roles` 쿼리 N회 → 1회.
- 브라우저 세션 내 동일 데이터 재사용으로 네트워크/DB 부하 감소.
