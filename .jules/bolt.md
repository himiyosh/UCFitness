## 2024-05-24 - Inline List Mapping Causing Avatar Re-renders
**Learning:** Dense lists (like leaderboards or following activity) mapped inline instead of delegating rows to their own components trigger re-renders of all deeply nested primitives like `UserAvatar` on any parent state change (e.g. hover).
**Action:** Always wrap primitive UI components like `UserAvatar` in `React.memo` when used across many different dense lists to mitigate performance impacts of sub-optimal parent rendering patterns without having to rewrite every list component.
