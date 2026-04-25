## 2024-05-30 - UserAvatar Re-render Performance
**Learning:** In inline list map renderings like leaderboards or feeds that lack dedicated row components (e.g., `AnimatedLeaderboard`), deeply nested primitive components like `UserAvatar` are subjected to full-grid re-renders on minor parent state changes (like hover effects on a row).
**Action:** Always verify if frequently rendered UI primitives like `UserAvatar` or `UserAvatar` are memoized, especially if they are heavily used inside arrays/lists that map inline. Use `React.memo` for components used across dense data displays.
