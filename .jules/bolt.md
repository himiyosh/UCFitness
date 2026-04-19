## 2024-05-18 - [Add React.memo() to UserAvatar]
**Learning:** In inline list maps (like leaderboards or feeds) that lack dedicated row components, deeply nested primitive components like UserAvatar trigger full-grid re-renders on minor parent state changes (e.g., hover effects).
**Action:** Wrapped UserAvatar with React.memo() to prevent unnecessary re-renders of avatars during list state updates.
