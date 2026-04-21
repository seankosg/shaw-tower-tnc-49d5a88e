

# S-Curve 미래 날짜 계획 막대 표시 수정

## 문제

`buildSCurve` 함수에서 `isFuture`일 때 모든 막대 세그먼트(`t1Met`, `t1Shortfall`, `t1Excess` 등)를 0으로 설정하고 있어, 미래 날짜의 **계획 막대도 표시되지 않는 버그**가 있습니다.

## 수정 내용

### `src/lib/dashboard-utils.ts` — 미래 날짜 막대 로직 수정

미래 날짜에서는:
- **Plan 막대**: `t1p`/`t2p` 값 그대로 표시 (Shortfall로 표현 — actual이 0이므로 plan 전체가 shortfall 색이 아닌 plan 색으로)
- **Actual 관련**: 0 유지

미래 날짜의 계획은 "아직 실적이 없는 상태"이므로, shortfall이 아닌 **plan 자체**로 표현해야 합니다. 이를 위해 미래 날짜용 새 필드 또는 조건부 처리를 추가합니다:

```typescript
// 변경 전 (lines 334-339)
t1Met: isFuture ? 0 : Math.min(t1p, t1a),
t1Shortfall: isFuture ? 0 : Math.max(0, t1p - t1a),
t1Excess: isFuture ? 0 : Math.max(0, t1a - t1p),
t2Met: isFuture ? 0 : Math.min(t2p, t2a),
t2Shortfall: isFuture ? 0 : Math.max(0, t2p - t2a),
t2Excess: isFuture ? 0 : Math.max(0, t2a - t2p),

// 변경 후
t1Met: isFuture ? t1p : Math.min(t1p, t1a),
t1Shortfall: isFuture ? 0 : Math.max(0, t1p - t1a),
t1Excess: isFuture ? 0 : Math.max(0, t1a - t1p),
t2Met: isFuture ? t2p : Math.min(t2p, t2a),
t2Shortfall: isFuture ? 0 : Math.max(0, t2p - t2a),
t2Excess: isFuture ? 0 : Math.max(0, t2a - t2p),
```

미래 날짜에서 `t1Met = t1p`로 설정하면 계획 수량이 진한 파랑/초록(Met 색상)으로 표시됩니다. Shortfall과 Excess는 0이므로 빨강/남색은 나타나지 않습니다.

## 결과

- **과거/오늘**: 기존대로 Met + Shortfall/Excess 조건부 색상
- **미래**: 계획 막대만 표시 (Met 색상), 실적 관련 없음

## 수정 파일

| 파일 | 변경 |
|------|------|
| `src/lib/dashboard-utils.ts` | lines 334, 337: `isFuture ? 0` → `isFuture ? t1p` / `isFuture ? t2p` |

