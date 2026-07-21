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
  { name: 'reflow', width: 320, height: 800 },
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'sidebar-boundary', width: 1024, height: 900 },
  { name: 'wide', width: 1920, height: 1080 },
];
const publicRoutes = [
  { name: 'home', path: '/' },
  { name: 'terms', path: '/legal/terms' },
  { name: 'privacy', path: '/legal/privacy' },
];
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
const interactiveAxRoles = new Set([
  'button', 'checkbox', 'combobox', 'link', 'listbox', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'searchbox',
  'slider', 'spinbutton', 'switch', 'tab', 'textbox', 'treeitem',
]);
const formAxRoles = new Set([
  'checkbox', 'combobox', 'listbox', 'radio', 'searchbox',
  'slider', 'spinbutton', 'switch', 'textbox',
]);
async function collectAccessibilityTreeMetrics(context, page) {
  const session = await context.newCDPSession(page);
  try {
    await session.send('Accessibility.enable');
    const { nodes } = await session.send('Accessibility.getFullAXTree');
    const describeAxNode = (node) => ({
      role: typeof node.role?.value === 'string' ? node.role.value : '',
      name: typeof node.name?.value === 'string' ? node.name.value.trim() : '',
      backendDOMNodeId: node.backendDOMNodeId ?? null,
    });
    const exposedNodes = nodes.filter((node) => !node.ignored);
    const controls = exposedNodes
      .map(describeAxNode)
      .filter((node) => interactiveAxRoles.has(node.role));
    const formControls = controls.filter((node) => formAxRoles.has(node.role));
    return {
      axControlCount: controls.length,
      axFormControlCount: formControls.length,
      unnamedControls: controls.filter((node) => !node.name),
      unlabeledFormControls: formControls.filter((node) => !node.name),
    };
  } finally {
    await session.detach();
  }
}
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
    const hasProgrammaticLabel = (element) => {
      const referencedText = (
      element.getAttribute('aria-labelledby')
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ') ?? ''
      );
      const hasLabels = 'labels' in element && Boolean(element.labels?.length);
      const ariaLabel = element.getAttribute('aria-label')?.trim() ?? '';
      const imageAlt = element instanceof HTMLInputElement && element.type === 'image'
        ? element.getAttribute('alt')?.trim() ?? ''
        : '';
      return hasLabels || ariaLabel.length > 0 || referencedText.length > 0 || imageAlt.length > 0;
    };
    const controls = Array.from(document.querySelectorAll(
      'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],label:has(input[type="checkbox"],input[type="radio"])',
    )).filter(visible).filter((element) =>
      !element.classList.contains('sr-only') || element === document.activeElement,
    );
    const formControlsWithoutProgrammaticLabels = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]),select,textarea',
    )).filter(visible).filter((element) => !hasProgrammaticLabel(element)).map(describe);
    const undersizedTargets = width <= 375
      ? controls.map((element) => {
        const rect = element.getBoundingClientRect();
        return { ...describe(element), width: rect.width, height: rect.height };
      }).filter((target) => target.width < 44 || target.height < 44)
      : [];
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
      .filter(visible);
    const headingOrderViolations = [];
    let previousHeadingLevel = 0;
    for (const heading of headings) {
      const level = Number(heading.tagName.slice(1));
      if (previousHeadingLevel > 0 && level > previousHeadingLevel + 1) {
        headingOrderViolations.push({
          previousLevel: previousHeadingLevel,
          level,
          ...describe(heading),
        });
      }
      previousHeadingLevel = level;
    }
    const duplicateIds = Array.from(document.querySelectorAll('[id]'))
      .map((element) => element.id)
      .filter((id, index, ids) => id.length > 0 && ids.indexOf(id) !== index);
    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'iframe',
      'audio[controls]',
      'video[controls]',
      '[contenteditable]:not([contenteditable="false"])',
      'summary',
      '[tabindex]',
    ].join(',');
    const ariaHiddenFocusable = Array.from(document.querySelectorAll('[aria-hidden="true"]'))
      .flatMap((container) => [
        ...(container.matches(focusableSelector) ? [container] : []),
        ...container.querySelectorAll(focusableSelector),
      ])
      .filter((element) => !element.closest('[inert]'))
      .filter((element) => !(element instanceof HTMLButtonElement
        || element instanceof HTMLInputElement
        || element instanceof HTMLSelectElement
        || element instanceof HTMLTextAreaElement)
        || !element.disabled)
      .filter(visible)
      .map(describe);
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
      formControlsWithoutProgrammaticLabels,
      headingOrderViolations,
      duplicateIds,
      ariaHiddenFocusable,
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
async function auditReducedMotion(context, url) {
  const reducedPage = await context.newPage();
  try {
    await reducedPage.emulateMedia({ reducedMotion: 'reduce' });
    await reducedPage.addInitScript(() => {
      window.__responsiveAuditMotionEvents = [];
      const recordMotion = (event) => {
        if (!(event.target instanceof Element) || event.target.closest('nextjs-portal')) return;
        window.__responsiveAuditMotionEvents.push({
          type: event.type,
          name: event.animationName ?? event.propertyName ?? '',
          tag: event.target.tagName.toLowerCase(),
        });
      };
      document.addEventListener('animationstart', recordMotion, true);
      document.addEventListener('transitionrun', recordMotion, true);
      const originalAnimate = Element.prototype.animate;
      Element.prototype.animate = function responsiveAuditAnimate(...args) {
        if (!this.closest('nextjs-portal')) {
          window.__responsiveAuditMotionEvents.push({
            type: 'web-animation',
            name: '',
            tag: this.tagName.toLowerCase(),
          });
        }
        return originalAnimate.apply(this, args);
      };
    });
    await reducedPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await reducedPage.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    await reducedPage.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolveFrame) =>
        requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
      );
    });
    return reducedPage.evaluate(() => ({
      events: window.__responsiveAuditMotionEvents ?? [],
      runningAnimations: document.getAnimations().filter((animation) =>
        animation.playState === 'running' || animation.playState === 'pending',
      ).map((animation) => ({
        playState: animation.playState,
        duration: animation.effect?.getTiming().duration ?? null,
      })),
    }));
  } finally {
    await reducedPage.close();
  }
}
async function auditLandingMobileMenu(page, route, viewport) {
  const notApplicable = {
    applicable: false,
    found: true,
    visible: true,
    viewportAligned: true,
    linksMeetTouchTarget: true,
    escapeClosed: true,
    escapeReturnedFocus: true,
  };
  if (scope !== 'public' || route.name !== 'home' || viewport.width > 375) return notApplicable;
  const trigger = page.locator('[data-landing-mobile-nav-trigger]');
  const menu = page.locator('[data-landing-mobile-nav]');
  if (await trigger.count() !== 1 || await menu.count() !== 1) {
    return { ...notApplicable, applicable: true, found: false };
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await trigger.click();
  const geometry = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const linkSizes = Array.from(element.querySelectorAll('a')).map((link) => {
      const linkRect = link.getBoundingClientRect();
      return { width: linkRect.width, height: linkRect.height };
    });
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      viewportWidth: window.innerWidth,
      linksMeetTouchTarget: linkSizes.every(({ width, height }) => width >= 44 && height >= 44),
    };
  });
  const visible = await menu.isVisible();
  await trigger.focus();
  await page.keyboard.press('Escape');
  const escapeState = await trigger.evaluate((element) => ({
    closed: !element.closest('details')?.hasAttribute('open'),
    returnedFocus: document.activeElement === element,
  }));
  return {
    applicable: true,
    found: true,
    visible,
    viewportAligned: geometry.left >= 15
      && geometry.right <= geometry.viewportWidth - 15
      && geometry.width >= geometry.viewportWidth - 34,
    linksMeetTouchTarget: geometry.linksMeetTouchTarget,
    escapeClosed: escapeState.closed,
    escapeReturnedFocus: escapeState.returnedFocus,
  };
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
  const firstTabState = await page.evaluate(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLAnchorElement)) {
      return { isSkipLink: false, hasVisibleFocus: false, targetExists: false };
    }
    const targetUrl = new URL(activeElement.href, location.href);
    const sameDocument = targetUrl.origin === location.origin
      && targetUrl.pathname === location.pathname
      && targetUrl.search === location.search;
    let target = null;
    try {
      target = sameDocument && targetUrl.hash
        ? document.getElementById(decodeURIComponent(targetUrl.hash.slice(1)))
        : null;
    } catch {
      target = null;
    }
    const style = getComputedStyle(activeElement);
    const rect = activeElement.getBoundingClientRect();
    const hasOutline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    return {
      isSkipLink: sameDocument && Boolean(target),
      hasVisibleFocus: activeElement.matches(':focus-visible')
        && rect.left < innerWidth
        && rect.right > 0
        && rect.top < innerHeight
        && rect.bottom > 0
        && (hasOutline || style.boxShadow !== 'none'),
      targetExists: Boolean(target),
    };
  });
  let skipTargetState = {
    focused: false,
    visibleBelowHeader: false,
    hasVisibleFocus: false,
    notObscured: false,
  };
  if (firstTabState.isSkipLink && firstTabState.targetExists) {
    await page.keyboard.press('Enter');
    await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(resolveFrame)));
    skipTargetState = await page.evaluate(() => {
      const activeElement = document.activeElement;
      const pageMain = document.querySelector('main');
      const activeIsInMain = activeElement instanceof HTMLElement
        && pageMain instanceof HTMLElement
        && (activeElement === pageMain || pageMain.contains(activeElement));
      const activeStyle = activeElement instanceof HTMLElement
        ? getComputedStyle(activeElement)
        : null;
      const activeRect = activeElement instanceof HTMLElement
        ? activeElement.getBoundingClientRect()
        : null;
      const headerBottom = Math.max(0, ...Array.from(document.querySelectorAll('header'))
        .filter((header) => header.getClientRects().length > 0)
        .filter((header) => ['fixed', 'sticky'].includes(getComputedStyle(header).position))
        .map((header) => header.getBoundingClientRect().bottom));
      const hasOutline = activeStyle?.outlineStyle !== 'none'
        && Number.parseFloat(activeStyle?.outlineWidth ?? '0') > 0;
      const visibleBelowHeader = activeRect
        ? activeRect.top >= headerBottom - 1
          && activeRect.bottom > headerBottom
          && activeRect.left < innerWidth
          && activeRect.right > 0
          && activeRect.top < innerHeight
        : false;
      const probeX = activeRect
        ? Math.min(Math.max(activeRect.left + 1, 1), innerWidth - 1)
        : 0;
      const probeY = activeRect
        ? Math.min(Math.max(activeRect.top + 1, headerBottom + 1), innerHeight - 1)
        : 0;
      const elementAtProbe = activeRect ? document.elementFromPoint(probeX, probeY) : null;
      return {
        focused: activeIsInMain,
        visibleBelowHeader,
        hasVisibleFocus: Boolean(
          activeElement instanceof HTMLElement
          && activeElement.matches(':focus-visible')
          && hasOutline
        ),
        notObscured: Boolean(
          activeElement instanceof HTMLElement
          && elementAtProbe
          && (activeElement === elementAtProbe || activeElement.contains(elementAtProbe))
        ),
      };
    });
  }
  const metrics = await collectMetrics(page, route, locale, viewport);
  const accessibilityMetrics = await collectAccessibilityTreeMetrics(context, page);
  const landingMobileMenuState = await auditLandingMobileMenu(page, route, viewport);
  const reducedMotionState = await auditReducedMotion(context, page.url());
  const result = {
    locale,
    viewport: viewport.name,
    route: route.path,
    finalUrl: page.url(),
    status: response?.status() ?? null,
    screenshotPath,
    firstTabIsSkipLink: firstTabState.isSkipLink,
    firstTabHasVisibleFocus: firstTabState.hasVisibleFocus,
    skipTargetState,
    landingMobileMenuState,
    reducedMotionState,
    ...accessibilityMetrics,
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
  if (result.axControlCount === 0) violations.push('AX tree exposes no interactive controls');
  if (result.unnamedControls.length) violations.push('interactive controls without accessible names');
  if (result.unlabeledFormControls.length) violations.push('form controls without accessible names');
  if (result.formControlsWithoutProgrammaticLabels.length) {
    violations.push('form controls without programmatic labels');
  }
  if (result.headingOrderViolations.length) violations.push('heading levels are skipped');
  if (result.duplicateIds.length) violations.push('duplicate element IDs');
  if (result.ariaHiddenFocusable.length) violations.push('focusable content is hidden from assistive technology');
  if (result.clippedFixedElements.length) violations.push('fixed elements extend beyond viewport');
  if (!result.clsPassed) violations.push(`CLS ${result.cls.toFixed(3)} exceeds ${maxCls}`);
  if (!result.langPassed) violations.push(`document language is "${result.lang || 'missing'}"`);
  if (!result.titlePassed) violations.push('document title is missing');
  if (result.mainCount !== 1 || result.h1Count !== 1) {
    violations.push(`main/h1 count is ${result.mainCount}/${result.h1Count}`);
  }
  if (!result.firstTabIsSkipLink) violations.push('first focus target is not a skip link');
  if (!result.firstTabHasVisibleFocus) violations.push('skip link focus is not visible');
  if (!result.skipTargetState.focused) violations.push('skip link does not move focus into main');
  if (!result.skipTargetState.visibleBelowHeader) violations.push('skip target is obscured by a fixed header');
  if (!result.skipTargetState.hasVisibleFocus) violations.push('skip target focus is not visible');
  if (!result.skipTargetState.notObscured) violations.push('skip target is covered by another element');
  if (result.landingMobileMenuState.applicable) {
    if (!result.landingMobileMenuState.found) violations.push('mobile landing menu is missing');
    if (!result.landingMobileMenuState.visible) violations.push('mobile landing menu does not open');
    if (!result.landingMobileMenuState.viewportAligned) {
      violations.push('mobile landing menu is not aligned to viewport gutters');
    }
    if (!result.landingMobileMenuState.linksMeetTouchTarget) {
      violations.push('mobile landing menu links are below 44x44px');
    }
    if (!result.landingMobileMenuState.escapeClosed
      || !result.landingMobileMenuState.escapeReturnedFocus) {
      violations.push('mobile landing menu Escape behavior is incomplete');
    }
  }
  if (result.reducedMotionState.events.length
    || result.reducedMotionState.runningAnimations.length) {
    violations.push('motion remains active with reduced motion');
  }
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
