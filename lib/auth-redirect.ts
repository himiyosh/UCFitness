export function createLoginRequiredRedirect(locale: string, nextPath: string): string {
  const normalizedLocale = locale || "ja";
  const normalizedPath = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  const localizedPath = normalizedPath === `/${normalizedLocale}` || normalizedPath.startsWith(`/${normalizedLocale}/`)
    ? normalizedPath
    : `/${normalizedLocale}${normalizedPath}`;

  return `/${normalizedLocale}?auth=required&next=${encodeURIComponent(localizedPath)}`;
}
