## 목적

시스템 **점검·유지보수**나 **정무적 사유**(예: 데이터 검증 중단, 분쟁 중 입력 동결, 회의 전 스냅샷 고정 등)로 T&C / Defect 모듈을 **일시 중단**할 수 있게 한다. 데이터는 절대 건드리지 않으며, admin이 토글 한 번으로 즉시 중단·재개한다.

## 권한 정책

- **admin만**: 토글 가능, 중단 중에도 모든 페이지 접근 가능 (점검·복구·검증용)
- **superuser 포함 그 외 모두**: 중단된 모듈 사용 불가 — 사이드바에서 사라지고, 직접 URL 접근 시 안내 화면으로 차단

## UX — "유지보수 중" 톤

단순히 메뉴를 숨기는 것을 넘어, **이유를 명시**하고 **재개 예정 안내**까지 보여줘서 사용자가 혼란스럽지 않게 한다.

### Admin이 끌 때 입력하는 정보
1. **사유 메모** (필수, 예: "월말 데이터 검증 중", "11월 정기 점검", "데이터 정정 중 — 입력 동결")
2. **예상 재개 시각** (선택, datetime)
3. **공지 메시지** (선택, 사용자에게 보일 안내문 — 비우면 사유 메모를 그대로 사용)

### 일반 사용자가 보게 되는 화면
- 사이드바: 해당 모듈 그룹 숨김
- 직접 URL 접근 시: **"점검 중" 풀스크린 안내**
  - 큰 아이콘 + "T&C 모듈 일시 중단 중"
  - 사유 메모 / 공지 메시지 표시
  - "예상 재개: 2026-04-28 09:00 (KST)" (있는 경우)
  - "관리자에 의해 일시적으로 중단되었습니다. 데이터는 안전하게 보존되어 있습니다." 문구
  - 다른 활성 모듈로 이동하는 버튼

### Admin이 보는 화면 (모듈 중단 중에도 접근 가능)
- 화면 상단 sticky 배너: 노란색/주황색 경고
  - "⚠ T&C 모듈 일시 중단 중 — 사유: '월말 데이터 검증 중' · 시작 2026-04-27 14:30 by 김관리"
  - "재개" 버튼 (한 번 클릭으로 즉시 재활성화)
- 사이드바 그룹 라벨 옆 "Paused" 배지

## 변경 사항

### 1. DB

기존 `app_settings`에 단일 키 두 개로 객체 저장 (단순 boolean보다 메타데이터 포함):

```sql
INSERT INTO public.app_settings (key, value)
VALUES
  ('module_tnc_status', '{"enabled": true}'::jsonb),
  ('module_defect_status', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

비활성 시 저장되는 value 예:
```json
{
  "enabled": false,
  "reason": "월말 데이터 검증 중 — 입력 동결",
  "message": "10월 데이터 마감 검증을 위해 잠시 입력을 중단합니다.",
  "expected_resume_at": "2026-04-28T09:00:00+09:00",
  "paused_at": "2026-04-27T14:30:00+09:00",
  "paused_by_user_id": "uuid",
  "paused_by_name": "김관리"
}
```

**RLS 강화** — 모듈 키는 admin만 수정 가능 (superuser도 불가):
```sql
DROP POLICY "Admins can manage app settings" ON public.app_settings;

CREATE POLICY "Admin only for module keys, superuser+ for others"
ON public.app_settings
FOR ALL TO authenticated
USING (
  CASE WHEN key IN ('module_tnc_status','module_defect_status')
    THEN public.has_role(auth.uid(), 'admin'::public.app_role)
    ELSE public.is_admin_or_superuser(auth.uid())
  END
)
WITH CHECK (
  CASE WHEN key IN ('module_tnc_status','module_defect_status')
    THEN public.has_role(auth.uid(), 'admin'::public.app_role)
    ELSE public.is_admin_or_superuser(auth.uid())
  END
);
```
읽기 정책(`Anyone can read app settings`)은 그대로 — 모든 사용자가 안내 화면용으로 읽어야 함.

추가로 토글 행위는 `event_log`에 기록되도록 admin 액션 코드에서 직접 INSERT (자동 트리거는 app_settings에 없음). 액션명: `module_pause` / `module_resume`.

### 2. 신규 파일

**`src/contexts/ModuleStatusContext.tsx`**
- 두 모듈 상태 객체 로드 + Supabase Realtime으로 즉시 갱신
- export type:
  ```ts
  type ModuleStatus = {
    enabled: boolean;
    reason?: string;
    message?: string;
    expectedResumeAt?: string;
    pausedAt?: string;
    pausedByName?: string;
  };
  ```
- `useModuleStatus()` → `{ tnc: ModuleStatus, defect: ModuleStatus, loading, refresh }`

**`src/components/layout/ModulePausedScreen.tsx`**
- 풀스크린 안내 화면 컴포넌트
- props: `module: 'tnc' | 'defect'`, `status: ModuleStatus`
- 디자인: 중앙 정렬 카드, Lucide `Construction`/`PauseCircle` 아이콘, 사유·공지·예상 재개 시각·다른 모듈 이동 버튼

**`src/components/layout/ModulePausedBanner.tsx`**
- admin이 페이지 상단에 보는 sticky 경고 배너
- "재개" 버튼 포함 → 즉시 `enabled: true`로 업데이트

### 3. App.tsx
`AuthProvider` 안쪽에 `ModuleStatusProvider` 래핑.

### 4. 사이드바 (`src/components/layout/AppSidebar.tsx`)
- `useModuleStatus()` + `useAuth()` 사용
- `isAdmin`이 아니면 비활성 모듈의 nav 그룹 자체를 렌더하지 않음
- admin은 항상 표시하되, 그룹 라벨 옆에 노란 "Paused" 배지

### 5. 라우트 가드 (`src/components/layout/RoleGuard.tsx`)
기존 role 체크에 모듈 상태 체크 추가:
- 경로가 `/tc/...`인데 `tnc.enabled === false`이면:
  - `isAdmin`: 통과 (배너만 표시)
  - 그 외: `<ModulePausedScreen module="tnc" status={tnc} />` 렌더 (리다이렉트 대신 안내 화면 표시 — 사용자가 이유를 알 수 있도록)
- `/defects/...` 동일 처리

### 6. AppLayout (`src/components/layout/AppLayout.tsx`)
- admin이고 어느 모듈이든 paused면 헤더 아래 `ModulePausedBanner` 렌더

### 7. 임포트 페이지
`src/pages/ImportPage.tsx`, `src/pages/DefectImportPage.tsx`:
- 모듈이 paused면 (admin 포함) 업로드 폼 비활성 + "🔒 모듈 점검 중 — 업로드가 잠겼습니다. 사유: ..." 표시
- admin도 점검 중에는 업로드 거부 (실수로 검증 중 데이터에 새 입력이 끼어드는 것 방지)

### 8. Admin 페이지 (`src/pages/AdminPage.tsx`)
**`isAdmin`인 경우에만** 새 카드 "Module Control" 추가 (System Master 탭 상단 또는 별도 탭):

```
┌─ Module Control ────────────────────────────────────┐
│  T&C Module                              [● Active] │
│  Last paused: —                                     │
│  ─────────────────────────────────────────────────  │
│  Defect Module                       [○ Paused]    │
│  Sauce: 월말 데이터 검증 중                           │
│  Paused: 2026-04-27 14:30 by 김관리                 │
│  Resume by: 2026-04-28 09:00                        │
│  [재개하기]                                           │
└─────────────────────────────────────────────────────┘
```

- 토글 OFF 클릭 시 `PauseModuleDialog` 모달:
  - 사유 메모 (필수, textarea, placeholder: "예: 월말 데이터 검증, 정기 점검, 데이터 정정 중")
  - 사용자 공지 메시지 (선택)
  - 예상 재개 일시 (선택, datetime-local)
  - 경고 문구: "Superuser를 포함한 모든 사용자(관리자 제외)가 이 모듈에 접근할 수 없게 됩니다. 데이터는 그대로 보존됩니다."
  - [취소] [일시 중단]
- 토글 ON 클릭 시 간단 확인 다이얼로그 → 즉시 재개
- 두 동작 모두 `event_log`에 기록

## 관련 파일 수정 요약

| 파일 | 변경 |
|---|---|
| 마이그레이션 | `app_settings` 두 키 시드 (객체 형태) + admin-only RLS |
| `src/contexts/ModuleStatusContext.tsx` (신규) | 전역 상태 + Realtime |
| `src/components/layout/ModulePausedScreen.tsx` (신규) | 사용자용 안내 화면 |
| `src/components/layout/ModulePausedBanner.tsx` (신규) | admin용 sticky 배너 |
| `src/App.tsx` | Provider 래핑 |
| `src/components/layout/AppLayout.tsx` | 배너 마운트 |
| `src/components/layout/AppSidebar.tsx` | nav 숨김 + admin Paused 배지 |
| `src/components/layout/RoleGuard.tsx` | paused 모듈 안내 화면 표시 |
| `src/pages/ImportPage.tsx` | paused 시 업로드 잠금 |
| `src/pages/DefectImportPage.tsx` | paused 시 업로드 잠금 |
| `src/pages/AdminPage.tsx` | "Module Control" 카드 + Pause 다이얼로그 (admin only) |

## 범위 외

- 데이터 자체 변경 없음 — 가시성·접근 플래그만 토글
- 프로젝트 단위 분리 제어 없음 — 전체 시스템 단일 토글
- 자동 재개 스케줄러 없음 — `expected_resume_at`은 안내 표기용이며, 실제 재개는 admin이 수동 토글
