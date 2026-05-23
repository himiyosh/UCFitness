---
name: next-intl-add-language
description: 'Add new language to a Next.js + next-intl application'
---

This is a guide to add a new language to a Next.js project using next-intl for internationalization,

- For i18n, the application uses next-intl.
- All translations are in the directory `./messages`.
- Routing and middleware configuration are handled in:
  - `./i18n.ts`
  - `./navigation.ts`
  - `./middleware.ts`

When adding a new language:

- Translate all the content of `en.json` to the new language. The goal is to have all the JSON entries in the new language for a complete translation.
- Add the locale to `routing.locales` in `navigation.ts`.
- Update `i18n.ts` and `middleware.ts` only if their locale handling changes.
- Add or update any visible language switcher options in the current UI.
