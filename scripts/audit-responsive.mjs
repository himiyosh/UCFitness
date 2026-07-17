import { access, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from 'playwright';
const baseUrl = new URL(process.env.RESPONSIVE_AUDIT_BASE_URL ?? 'http://localhost:3000');
const outputRoot = resolve(process.env.RESPONSIVE_AUDIT_OUTPUT ?? 'screenshots/responsive');
const scope = process.env.RESPONSIVE_AUDIT_SCOPE ?? 'full';
const maxCls = 0.1;
const fixtures = Object.fromEntries(['ja', 'en'].map((locale) => {
  const suffix = locale.toUpperCase(); return [locale, {
    storageState: process.env[`RESPONSIVE_AUDIT_STORAGE_STATE_${suffix}`],
    username: process.env[`RESPONSIVE_AUDIT_USERNAME_${suffix}`], groupId: process.env[`RESPONSIVE_AUDIT_GROUP_ID_${suffix}`],
  }];
}));
if (!['full', 'public'].includes(scope)) throw new Error('Invalid RESPONSIVE_AUDIT_SCOPE');
if (scope === 'full') {
  for (const [locale, fixture] of Object.entries(fixtures)) {
    if (Object.values(fixture).some((value) => !value)) throw new Error(`${locale} fixture is incomplete`);
    await access(fixture.storageState);
  }
}
const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'sidebar-boundary', width: 1024, height: 900 },
  { name: 'wide', width: 1920, height: 1080 },
];
const publicRoutes = [{ name: 'home', path: '/' }];
const authenticatedRoutes = [
  ['analytics', '/analytics'], ['challenges', '/challenges'],
  ['group-create', '/groups/create'], ['groups', '/groups'],
  ['leaderboard', '/leaderboard?period=WEEKLY'], ['recommendations', '/recommendations'],
  ['settings', '/settings'], ['shop', '/shop'], ['setup', '/setup'], ['wallet', '/wallet'],
].map(([name, path]) => ({ name, path }));
const routesFor = (locale) => scope === 'public' ? publicRoutes : [
  ...publicRoutes, ...authenticatedRoutes,
  { name: 'user-profile', path: `/user/${encodeURIComponent(fixtures[locale].username)}` },
  { name: 'group-detail', path: `/groups/${encodeURIComponent(fixtures[locale].groupId)}` },
];
async function collectMetrics(page, route, locale, viewport) {
  return page.evaluate(({ expectedPath, expectedLocale, height, width, clsLimit }) => {
    const root = document.documentElement;
    const body = document.body;
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && rect.width > 0 && rect.height > 0;
    };
    const describe = (element) => ({
      tag: element.tagName.toLowerCase(),
      text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) ?? '',
      ariaLabel: element.getAttribute('aria-label'),
    });
    const controls = Array.from(document.querySelectorAll(
      'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],label:has(input[type="checkbox"],input[type="radio"])',
    )).filter(visible).filter((element) =>
      !element.classList.contains('sr-only') || element === document.activeElement,
    );
    const undersizedTargets = width === 375
      ? controls.map((element) => {
        const rect = element.getBoundingClientRect();
        return { ...describe(element), width: rect.width, height: rect.height };
      }).filter((target) => target.width < 44 || target.height < 44)
      : [];
    const clippedFixedElements = Array.from(document.querySelectorAll('*'))
      .filter(visible)
      .filter((element) => element.getAttribute('aria-hidden') !== 'true')
      .filter((element) => getComputedStyle(element).position === 'fixed')
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left < -1 || rect.right > width + 1
        || rect.top < -1 || rect.bottom > height + 1).map(({ element }) => describe(element));
    const normalize = (pathname) => pathname.replace(/^\/(?:ja|en)(?=\/|$)/, '') || '/';
    const requestedPath = normalize(new URL(expectedPath, location.origin).pathname);
    const finalPath = normalize(location.pathname);
    const cls = window.__responsiveAuditCls ?? 0;
    return {
      requestedPath,
      finalPath,
      horizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) - root.clientWidth,
      undersizedTargets,
      clippedFixedElements,
      cls,
      clsPassed: cls < clsLimit,
      lang: root.lang,
      langPassed: root.lang === expectedLocale,
      mainCount: document.querySelectorAll('main').length,
      h1Count: document.querySelectorAll('h1').length,
      titlePassed: document.title.trim().length > 0,
    };
  }, {
    expectedPath: route.path,
    expectedLocale: locale,
    height: viewport.height,
    width: viewport.width,
    clsLimit: maxCls,
  });
}
async function auditPage(browser, locale, viewport, route) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    locale: locale === 'ja' ? 'ja-JP' : 'en-US',
    storageState: fixtures[locale]?.storageState,
  });
  try {
    await context.addCookies([{
    name: 'NEXT_LOCALE',
    value: locale,
    url: baseUrl.origin,
    sameSite: 'Lax',
    secure: baseUrl.protocol === 'https:',
  }]);
  await context.addInitScript(() => {
    window.__responsiveAuditCls = 0;
    new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        if (!entry.hadRecentInput) window.__responsiveAuditCls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push({
    url: request.url(),
    resourceType: request.resourceType(),
    errorText: request.failure()?.errorText ?? 'unknown',
  }));
  const response = await page.goto(new URL(route.path, baseUrl).toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolveFrame) =>
      requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
    );
  });
  const directory = resolve(outputRoot, locale, viewport.name);
  const screenshotPath = resolve(directory, `${route.name}.png`);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.keyboard.press('Tab');
  const firstTabIsSkipLink = await page.evaluate(() =>
    document.activeElement instanceof HTMLAnchorElement && document.activeElement.hash.length > 1,
  );
  const metrics = await collectMetrics(page, route, locale, viewport);
  const result = {
    locale,
    viewport: viewport.name,
    route: route.path,
    finalUrl: page.url(),
    status: response?.status() ?? null,
    screenshotPath,
    firstTabIsSkipLink,
    ...metrics,
    consoleErrors,
    pageErrors,
    failedRequests,
  };
    return result;
  } finally {
    await context.close();
  }
}
function findViolations(result) {
  const violations = [];
  if (result.status === null || result.status >= 400) violations.push(`HTTP ${result.status}`);
  const allowedPaths = result.requestedPath === '/setup' ? ['/setup', '/'] : [result.requestedPath];
  if (!allowedPaths.includes(result.finalPath)) violations.push(`ended at ${result.finalPath}`);
  if (result.horizontalOverflow > 1) {
    violations.push(`horizontal overflow ${result.horizontalOverflow}px`);
  }
  if (result.undersizedTargets.length) {
    violations.push(`${result.undersizedTargets.length} touch targets below 44x44px`);
  }
  if (result.clippedFixedElements.length) violations.push('fixed elements extend beyond viewport');
  if (!result.clsPassed) violations.push(`CLS ${result.cls.toFixed(3)} exceeds ${maxCls}`);
  if (!result.langPassed) violations.push(`document language is "${result.lang || 'missing'}"`);
  if (!result.titlePassed) violations.push('document title is missing');
  if (result.mainCount !== 1 || result.h1Count !== 1) {
    violations.push(`main/h1 count is ${result.mainCount}/${result.h1Count}`);
  }
  if (!result.firstTabIsSkipLink) violations.push('first focus target is not a skip link');
  if (result.consoleErrors.length || result.pageErrors.length) violations.push('browser errors');
  const criticalFailures = result.failedRequests.filter(({ resourceType }) => (
    ['document', 'stylesheet', 'script', 'font'].includes(resourceType)
  ));
  if (criticalFailures.length) violations.push(`${criticalFailures.length} critical failures`);
  return violations;
}
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const locale of ['ja', 'en']) {
    for (const viewport of viewports) {
      for (const route of routesFor(locale)) {
        let result;
        try {
          result = await auditPage(browser, locale, viewport, route);
          result.violations = findViolations(result);
        } catch (error) {
          result = {
            locale,
            viewport: viewport.name,
            route: route.path,
            violations: [`audit failed: ${error instanceof Error ? error.message : 'unknown'}`],
          };
        }
        results.push(result);
        if (process.env.RESPONSIVE_AUDIT_VERBOSE === '1' || result.violations.length) {
          console.log(`${result.violations.length ? 'NG' : 'OK'}: ${locale} ${viewport.name} ${route.path}`);
        }
      }
    }
  }
} finally {
  await browser.close();
}
const failures = results.filter(({ violations }) => violations.length);
const summary = {
  total: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  failures: failures.map(({ locale, viewport, route, violations }) => ({
    locale,
    viewport,
    route,
    violations,
  })),
};
await mkdir(outputRoot, { recursive: true });
const summaryPath = resolve(outputRoot, 'summary.json');
const reportPath = resolve(outputRoot, 'report.json');
await Promise.all([
  writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8'),
  writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8'),
]);
console.log(
  `${failures.length ? 'NG' : 'OK'}: responsive audit ${summary.passed}/${summary.total} passed; ` +
  `summary=${summaryPath}; report=${reportPath}`,
);
if (failures.length) process.exitCode = 1;
