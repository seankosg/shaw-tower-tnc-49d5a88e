

# 컬럼 순서 변경 + 기본 정렬 + 사용자별 필터/정렬 상태 영구 저장

## 1. 컬럼 순서 재조정 (`src/pages/SubtestList.tsx`)
`columns` 배열에서 `item_no`를 맨 앞으로 이동:
- 변경 전: `system_code → item_no → equipment → subtest_id → ...`
- 변경 후: `item_no → system_code → equipment → subtest_id → ...`

## 2. 기본 정렬값
`sorting` 초기값을 `[{ id: 'item_no', desc: false }]`로 설정 (Item No 오름차순).

## 3. 사용자별 필터/정렬 상태 유지

### 저장 대상
- `sorting` (다중 정렬 상태)
- `columnFilters` (컬럼별 필터)
- `globalFilter` (검색어)

### 저장 방식: localStorage (사용자별 키)
`AuthContext`의 `user.id`를 키 prefix로 사용 → 같은 브라우저에서 다른 사용자 로그인 시 분리.

```ts
const storageKey = user?.id 
  ? `subtest-list-state:${user.id}` 
  : 'subtest-list-state:anon';
```

### 동작
- **마운트 시**: localStorage에서 읽어 `useState` 초기값으로 사용 (없으면 기본값 = Item No 오름차순)
- **상태 변경 시**: `useEffect`로 `sorting`, `columnFilters`, `globalFilter` 직렬화 후 저장
- **Clear sort / 필터 초기화**: 자동으로 빈 상태가 저장됨

### 왜 localStorage인가
- DB 저장은 별도 테이블/RLS/마이그레이션 필요 → 과한 비용
- 사용자가 브라우저 바꾸면 리셋되지만, 일반적인 "내 화면 기억" 요구사항에는 충분
- 추후 필요하면 `user_preferences` 테이블로 마이그레이션 가능

## 변경 파일
| 파일 | 변경 |
|------|------|
| `src/pages/SubtestList.tsx` | 컬럼 순서 재배열, 기본 sorting을 Item No asc로, useAuth로 user.id 가져와 localStorage에 sorting/columnFilters/globalFilter persist |

