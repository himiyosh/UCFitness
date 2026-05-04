
## 2024-05-04 - [React.memo in Inline List Rendering]
**Learning:** Nested primitive components like `UserAvatar` inside inline list maps (e.g., `AnimatedLeaderboard` which doesn't use row components) cause full-grid re-renders on minor parent state changes like hover.
**Action:** Always wrap such deeply nested primitive UI components in `React.memo` to prevent O(N) render bottlenecks when lists have interactive states.
