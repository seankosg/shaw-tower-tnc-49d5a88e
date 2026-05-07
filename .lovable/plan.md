## Add Guest User Type

Adds a new `guest` value to the `user_type` enum so users like external visitors / observers can be classified separately from HDEC, Subcontractor, Sub-Sub, PM/PD, Admin.

### Scope

- `user_type` (소속 유형) only. The `role` (권한) system is untouched — guest user_type users will typically be assigned the `guest` or `super_guest` role, but that's chosen independently in the same form.
- Affiliation fields (`subcontractor_name`, `subsub_name`, `hdec_pic_name`, `hdec_eng_name`) remain nullable. For Guest, the only optional field shown is **Organisation / Company** — stored in existing `subcontractor_name` column as a free-text label (no master matching, no owner code).

### Changes

**1. Database migration**
- `ALTER TYPE public.user_type ADD VALUE 'guest';`

**2. `src/types/enums.ts`**
- Add `'guest'` to `UserType` union.
- Append `'guest'` to `ALL_USER_TYPES`.
- Add `guest: 'Guest'` to `USER_TYPE_LABELS`.

**3. `src/pages/AdminPage.tsx`**
- Create User & Edit User dialogs: when `userType === 'guest'`, show one optional **Organisation** text input bound to `subcontractor_name` payload (no select, no validation). Hide all HDEC PIC/ENG and subcontractor master selectors.
- `handleSubmit`: skip required-field guards for guest; pass `subcontractor_name` (trimmed, or null), all other affiliation fields null.
- Display helpers (sort/export/table cells around lines 369, 405, 514): treat `guest` like a no-affiliation type — show `subcontractor_name` if present, else `—`.

**4. Edge functions**
- `supabase/functions/admin-create-user/index.ts` — extend `Body.user_type` union to include `'guest'`.
- `supabase/functions/admin-update-user/index.ts` — same.

### Out of scope

- No RLS changes. Access control stays driven entirely by `role`, not `user_type`.
- No changes to data tables or imports — `user_type` is purely a profile classification.
- No new master tables for Guest organisations.
