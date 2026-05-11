# Admin(VP) 코멘트/리플라이 시각적 강조

Admin 역할 사용자(표시명 **VP**)가 작성한 코멘트와 리플라이를 모든 모듈에서 즉시 식별 가능하도록 강조합니다.

## 적용 대상 컴포넌트

전 모듈 코멘트 컴포넌트:
- `src/components/comments/OmmComments.tsx`
- `src/components/comments/WarrantyComments.tsx`
- `src/components/comments/SparePartComments.tsx`
- `src/components/defects/DefectComments.tsx`
- `src/components/defects/SubtestComments.tsx`
- `src/components/comments/AllCommentsView.tsx`
- `src/components/dashboard/RecentDefectComments.tsx`
- `src/components/dashboard/RecentSubtestComments.tsx`

## 동작

각 컴포넌트는 이미 `author_user_id` 목록으로 `profiles`를 조회 중입니다. 동일한 ID 목록으로 `user_roles` 테이블을 추가 조회하여 author가 `admin` 역할을 가졌는지 판정합니다.

```text
author_user_id 집합 → profiles 조회 (기존)
                  → user_roles 조회 (신규, role='admin' 필터)
                  → vpAuthorIds: Set<string>
```

## 시각적 스타일

`vpAuthorIds`에 포함된 코멘트/리플라이 카드에 다음 적용:

1. **좌측 강조 보더**: 카드에 `border-l-4 border-l-primary` 추가 (기존 `border` 위에 덧붙음)
2. **VP 뱃지**: 작성자 이름 옆(타입 뱃지와 이름 사이)에 작은 뱃지 추가
   ```tsx
   <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary text-primary-foreground">
     VP
   </Badge>
   ```

기존 type 뱃지/배경(`typeBadgeStyle`)과 들여쓰기는 변경하지 않습니다.

## 공통 헬퍼

중복을 줄이기 위해 `src/lib/comment-author-roles.ts` 신규:

```ts
export async function fetchAdminAuthorIds(userIds: string[]): Promise<Set<string>>
```

`user_roles`에서 `role='admin' AND user_id IN (...)`로 조회 후 Set 반환. 8개 컴포넌트가 동일하게 사용.

## 비즈니스 로직 영향

없음. 권한 판정(`canEditOrDelete`, 수정/삭제, 작성 흐름) 변경 없음. 순수 표시 강조만 추가.

## 변경되지 않는 것

- 코멘트 데이터 스키마 (마이그레이션 없음)
- RLS 정책
- 타입 뱃지 색상, 들여쓰기, 정렬, 시간 표시
