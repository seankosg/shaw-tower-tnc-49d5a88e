

# S-Curve 차트 기본 X축 단위 변경 — Daily 기본값

## 요약

현재 S-Curve 차트의 기본 granularity가 `'week'`(Weekly)으로 설정되어 있는 것을 **`'day'`(Daily)로 변경**합니다. 기존 로직은 이미 Daily/Weekly 토글에 따라 올바르게 동작하므로 기본값만 수정합니다.

## 변경 내용

### `src/pages/DashboardPage.tsx` — 1줄 변경

```typescript
// 변경 전
const [scurveBucket, setScurveBucket] = useState<'day' | 'week'>('week');

// 변경 후
const [scurveBucket, setScurveBucket] = useState<'day' | 'week'>('day');
```

## 동작 확인

- **Daily (기본)**: 각 일별로 막대 + 누적 라인 표시
- **Weekly 클릭 시**: 주간 누계로 자동 집계 (월요일 기준 버킷)
- 날짜 범위 변경 시에도 선택된 granularity에 따라 정상 동작

## 수정 파일

| 파일 | 변경 |
|------|------|
| `src/pages/DashboardPage.tsx` | `scurveBucket` 초기값 `'week'` → `'day'` |

