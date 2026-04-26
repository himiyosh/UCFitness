
## $(date +%Y-%m-%d) - [UserAvatar Re-render Optimization]
**Learning:** In inline list maps (like leaderboards or feeds) that lack dedicated row components, deeply nested primitive components like UserAvatar must be wrapped in `React.memo()` to prevent full-grid re-renders on minor parent state changes (like hover effects). The previous implementation exported it directly as a function component without memoization, causing performance bottlenecks during list interactions.
**Action:** Always verify that frequently used, deeply nested generic components are memoized in list-heavy applications.
