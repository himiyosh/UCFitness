## 2024-05-24 - React.memo for UserAvatar
**Learning:** In lists or maps, primitive components like UserAvatar that receive many simple props can cause performance issues if not memoized, especially when the parent renders frequently due to hover or state changes.
**Action:** Wrapped UserAvatar with React.memo to prevent unnecessary re-renders when parent state changes.
