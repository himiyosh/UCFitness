## 2026-04-23 - [Memoize deeply nested primitive components]
**Learning:** In inline list maps (like AnimatedLeaderboard), deeply nested primitive components like UserAvatar must be wrapped in React.memo() to prevent full-grid re-renders on minor parent state changes (like hover effects).
**Action:** Always wrap deeply nested primitive components that are rendered in a loop in React.memo(), especially when the parent component handles interactions.
