Modify `DmrDashboardPage.tsx` to add a "Today's Manpower" label and value below the existing Subcontractor display.

Changes:
1. Compute today's total manpower by summing `manpower` from `filtered` rows where `report_date` equals today (formatted as YYYY-MM-DD).
2. Insert a new `<div>` directly below the existing Subcontractor name display (line ~316).
3. Render "Today's Manpower" label in the same text size (`text-[22px] font-bold`) as the Subcontractor line.
4. Render the computed value in red (`text-red-500`).
5. If no data exists for today, show `0` or `-`.

No backend or database changes required.