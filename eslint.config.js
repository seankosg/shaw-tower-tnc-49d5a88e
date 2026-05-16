import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Files that legitimately need to see ALL subtests (including soft-deleted
// is_active=false rows). Keep this list small and review additions carefully.
//   - subtest-population.ts: the canonical helper itself (it applies the filter)
//   - ImportContext / import logs / bulk-actions: must find inactive rows to
//     reactivate them on re-import or hard-delete on rollback.
//   - Admin master rename / Admin pages: operate on the full table.
//   - SubtestDetail / MobileUpdatePage: single-row lookup by id.
//   - SubtestList / ExportPage: raw-data views where the user intentionally
//     wants to see soft-deleted rows.
//   - ScheduleRevisionPage / RecentSubtestComments: feeds keyed by id.
const SUBTESTS_FETCH_ALLOWLIST = [
  "src/lib/subtest-population.ts",
  "src/contexts/ImportContext.tsx",
  "src/lib/bulk-actions.ts",
  "src/pages/AdminPage.tsx",
  "src/pages/ImportLogsPage.tsx",
  "src/pages/SubtestDetail.tsx",
  "src/pages/SubtestList.tsx",
  "src/pages/ExportPage.tsx",
  "src/pages/MobileUpdatePage.tsx",
  "src/pages/ScheduleRevisionPage.tsx",
  "src/components/dashboard/RecentSubtestComments.tsx",
  // Statistics callers below ALREADY apply `.eq('is_active', true)` inline.
  // They remain whitelisted for now; future refactor should migrate them to
  // fetchActiveSubtests().
  "src/pages/DashboardPage.tsx",
  "src/pages/SchedulePage.tsx",
  "src/pages/TncSimulationPage.tsx",
  "src/lib/report-builder.ts",
];

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Statistics-population guard: forbid raw `from('subtests')` in new code.
    // New statistics callers MUST use fetchActiveSubtests() from
    // src/lib/subtest-population.ts so the is_active=true filter is enforced.
    files: ["**/*.{ts,tsx}"],
    ignores: SUBTESTS_FETCH_ALLOWLIST,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value='subtests']",
          message:
            "Do not call supabase.from('subtests') directly. Use fetchActiveSubtests() from '@/lib/subtest-population' so the is_active=true filter is enforced. If you genuinely need to read soft-deleted rows, add this file to SUBTESTS_FETCH_ALLOWLIST in eslint.config.js with a justification comment.",
        },
      ],
    },
  },
);
