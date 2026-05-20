## Plan: Move Remaining/Baseline Toggle Next to CardTitle

### Scope
- **T&C Dashboard** (`src/pages/DashboardPage.tsx`)
- **Defect Dashboard** (`src/pages/DefectDashboardPage.tsx`)

### Current State
Both dashboards have the same `CardHeader` layout:
- Left: `<CardTitle>Plan vs Actual - Summary</CardTitle>`
- Right: a flex container with the Remaining/Baseline `ToggleGroup`, a descriptive label, and an Export `Button`

The user wants the `ToggleGroup` positioned immediately to the right of the `CardTitle`, while keeping the other right-side controls (export button, label) at the far right.

### Changes
1. **DashboardPage.tsx (line ~460)**
   - Wrap `CardTitle` + `ToggleGroup` in a single left-side flex container.
   - Keep the remaining right-side elements (description label + Excel button) in the existing right-side flex container.
   - Ensure no visual regression on `CardHeader` wrapping (`flex-wrap` behavior preserved).

2. **DefectDashboardPage.tsx (line ~408)**
   - Same structural change: wrap `CardTitle` + `ToggleGroup` together on the left.
   - Keep the "Plan" label + Export button on the right.

### No other files affected
No backend, data, or logic changes. Pure JSX layout adjustment.