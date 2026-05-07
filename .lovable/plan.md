## Add IP/Copyright Notice to Top Header

Apply the same copyright text and placement used in the ALSMK Management app to this SHAW T&C app's top header.

### What to add
A small copyright span in the header's right-side area (next to `BuildInfoChip`):

```tsx
<span className="text-[10px] text-muted-foreground/50 hidden sm:inline">
  © {new Date().getFullYear()} Sean B. KO. All rights reserved.
</span>
```

### Where
File: `src/components/layout/AppLayout.tsx`

In the header's right-side flex container (currently holding `GlobalImportIndicator`, `GlobalDefectImportIndicator`, `BuildInfoChip`, `AccountMenu`), insert the copyright span immediately before `<BuildInfoChip />`, matching ALSMK's ordering (BuildInfo + copyright grouped together).

### Styling
- Exact classes from source: `text-[10px] text-muted-foreground/50 hidden sm:inline`
- Hidden on mobile (sm:inline only) — matches source behavior
- Year auto-updates via `new Date().getFullYear()`

### No other changes
- No new components, no new files
- No business logic changes
- Sidebar, routing, and other layout untouched
