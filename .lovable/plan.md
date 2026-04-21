

# Sub-Sub 유저의 Linked Master / Subcontractor 표시 수정

## 요약

Sub-Sub 유저의 경우, "Linked Master" 컬럼과 관련 UI에서 `subcontractor_name / subsub_name` 형태로 표시하던 것을 **원청 하도사(subcontractor_name)만 표시**하도록 변경합니다.

## 변경 내용

### `src/pages/AdminPage.tsx` (282행)

**현재:**
```typescript
p.user_type === 'subsub' ? (p.subsub_name ? `${p.subcontractor_name ?? '—'} / ${p.subsub_name}` : p.subcontractor_name)
```

**변경:**
```typescript
p.user_type === 'subsub' ? p.subcontractor_name
```

Sub-Sub 유저(예: Equation)의 Linked Master에 원청 하도사(예: Puretech)만 표시됩니다.

## 수정 파일

| 파일 | 변경 |
|------|------|
| `src/pages/AdminPage.tsx` | UsersTab 테이블의 Linked Master 표시 로직 수정 (282행) |

