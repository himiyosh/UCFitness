## 2026-04-20 - [UserAvatar Re-renders]
**Learning:** Components mapping primitive components inline without a dedicated row component (like `AnimatedLeaderboard` wrapping `UserAvatar`) will re-render the entire list of primitive components upon any parent state change (e.g., hover).
**Action:** Always wrap deeply nested primitive components used in inline list maps (like `UserAvatar`) in `React.memo()` to prevent full-grid/list re-renders on minor parent state changes.
