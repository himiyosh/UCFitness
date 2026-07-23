import { build } from 'esbuild';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';

import {
    getWalkingRouteDistanceAria,
    getWalkingRouteDurationAria,
    parseWalkingRouteDistance,
    parseWalkingRouteDuration,
} from './WalkingRoutes';
import enMessages from '../messages/en.json';
import jaMessages from '../messages/ja.json';

const enWalkingRoutes = enMessages.WalkingRoutes;
const jaWalkingRoutes = jaMessages.WalkingRoutes;

describe('WalkingRoutes field validation', () => {
    it.each([
        ['1e2', undefined], ['1E2', undefined], ['1.', undefined], ['1,', undefined],
        ['.5', undefined],
        ['+1', undefined], ['-1', undefined], ['3abc', undefined], [' ', undefined],
        ['1\n', undefined], ['\t1', undefined], ['NaN', undefined], ['Infinity', undefined],
        ['9'.repeat(400), undefined],
        ['', null], ['0', 0], ['0.0', 0], ['1.5', 1.5], ['1,5', 1.5], ['001.50', 1.5],
    ])('距離入力"%s"を非負10進数全文として検証する', (value, expected) => {
        expect(parseWalkingRouteDistance(value)).toBe(expected);
    });
    it.each([
        ['1e2', undefined], ['1.5', undefined], ['3abc', undefined], [' ', undefined],
        ['-1', undefined], ['', null], ['0', 0], ['3', 3], ['+3', 3],
    ])('入力"%s"を部分変換せず検証する', (value, expected) => {
        expect(parseWalkingRouteDuration(value)).toBe(expected);
    });
    it.each([
        [true, { 'aria-describedby': 'walking-route-duration-error', 'aria-invalid': true }], [false, {}],
    ])('入力エラー状態が%sの場合にARIAを同期する', (invalid, expected) => {
        expect(getWalkingRouteDurationAria(invalid)).toEqual(expected);
    });
    it.each([
        [true, { 'aria-describedby': 'walking-route-distance-error', 'aria-invalid': true }], [false, {}],
    ])('距離入力エラー状態が%sの場合にARIAを同期する', (invalid, expected) => {
        expect(getWalkingRouteDistanceAria(invalid)).toEqual(expected);
    });
    it('入力検証と非同期操作エラーを実ChromeのDOM・focus・localeで検証する', async () => {
        const bundle = await build({
            stdin: {
                contents: `
                    import {createRoot} from 'react-dom/client'; import WalkingRoutes from './components/WalkingRoutes';
                    import enMessages from './messages/en.json'; import jaMessages from './messages/ja.json';
                    globalThis.walkingRouteMessages = {en: enMessages.WalkingRoutes, ja: jaMessages.WalkingRoutes};
                    document.documentElement.lang = 'en';
                    document.body.dataset.postCount = '0';
                    let routeIdSequence = 0;
                    globalThis.fetch = async (_input, init) => {
                        const method = init?.method;
                        if (method) { const key = method.toLowerCase() + 'AttemptCount';
                            document.body.dataset[key] = String(Number(document.body.dataset[key] ?? '0') + 1); }
                        if (method && document.body.dataset.deferNextAction === 'true') {
                            delete document.body.dataset.deferNextAction; return new Promise(
                                (resolve) => { globalThis.resolveDeferredAction = resolve; });
                        }
                        if (init?.method && document.body.dataset.failNextAction === 'true') {
                            delete document.body.dataset.failNextAction;
                            return {ok: false, json: async () => ({})};
                        }
                        if (init?.method === 'POST') {
                            const body = JSON.parse(String(init.body));
                            document.body.dataset.postCount = String(Number(document.body.dataset.postCount) + 1);
                            document.body.dataset.postBody = JSON.stringify(body);
                            return {ok: true, json: async () => ({route: {
                                id: 'route-' + (++routeIdSequence),
                                name: body.name, description: body.description,
                                distance_km: body.distance_km, duration_minutes: body.duration_minutes,
                                difficulty: body.difficulty, is_favorite: false, walk_count: 0,
                                last_walked_at: null, created_at: '2026-07-24T00:00:00.000Z',
                            }})};
                        }
                        return {ok: true, json: async () => ({routes: []})};
                    };
                    createRoot(document.querySelector('#root')).render(<WalkingRoutes />);`,
                loader: 'tsx', resolveDir: process.cwd(),
            },
            bundle: true, format: 'iife', jsx: 'automatic', platform: 'browser', write: false,
            plugins: [{
                name: 'test-resolver',
                setup(context) {
                    context.onResolve({ filter: /^@\// }, ({ path: importPath }) =>
                        ({ path: `${process.cwd()}/${importPath.slice(2)}.ts` }));
                    context.onResolve({ filter: /^next-intl$/ }, () => ({
                        path: 'next-intl', namespace: 'test-mock',
                    }));
                    context.onLoad({ filter: /.*/, namespace: 'test-mock' }, () =>
                        ({ contents: 'export const useTranslations = () => (key) => globalThis.walkingRouteMessages[document.documentElement.lang]?.[key] ?? key;' }));
                },
            }],
        });
        const browser = await chromium.launch({ channel: 'chrome', headless: true });
        try {
            const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
            const pageErrors: string[] = []; page.on('pageerror', (error) => pageErrors.push(error.message));
            await page.setContent(`
                <style>
                    [class~="min-h-[44px]"] { min-height: 44px; }
                    [class~="min-w-[44px]"] { min-width: 44px; }
                </style>
                <div id="root"></div>
            `);
            await page.addScriptTag({ content: bundle.outputFiles[0].text });
            const body = page.locator('body'); const bodyAttr = (name: string) => body.getAttribute(`data-${name}`);
            const actionAlert = (message: string) => page.getByRole('alert').filter({ hasText: message });
            const setActionFlag = (name: 'failNextAction' | 'deferNextAction') => page.evaluate(
                (flag) => { document.body.dataset[flag] = 'true'; }, name);
            await page.getByRole('button', { name: enWalkingRoutes.addRoute }).click();
            expect(pageErrors).toEqual([]);
            await page.getByRole('textbox', { name: enWalkingRoutes.namePlaceholder }).fill('Route');
            const duration = page.getByRole('spinbutton', { name: enWalkingRoutes.durationPlaceholder });
            expect(await duration.getAttribute('class')).toContain('min-h-[44px]');
            expect(await duration.getAttribute('class')).toContain('focus:ring-[var(--color-primary)]');
            expect(await duration.getAttribute('class')).toContain('focus:outline-[var(--color-primary)]');
            await duration.pressSequentially('-');
            expect(await duration.evaluate((input) => [
                (input as HTMLInputElement).validity.badInput, (input as HTMLInputElement).value,
            ])).toEqual([true, '']);
            await duration.evaluate((input) => {
                document.body.dataset.focusCount = '0';
                input.addEventListener('focus', () => {
                    document.body.dataset.focusCount = String(Number(document.body.dataset.focusCount) + 1);
                    document.body.dataset.focusSnapshot = [
                        input.getAttribute('aria-invalid'), input.getAttribute('aria-describedby'),
                        Boolean(document.getElementById('walking-route-duration-error')),
                    ].join('|');
                });
            });
            const save = page.getByRole('button', { name: enWalkingRoutes.save });
            for (const expectedFocusCount of ['1', '2']) {
                await save.click();
                await page.waitForFunction((count) => document.body.dataset.focusCount === count, expectedFocusCount);
                expect(await page.locator('body').getAttribute('data-focus-snapshot')).toBe(
                    'true|walking-route-duration-error|true');
                expect(await page.locator('body').getAttribute('data-post-count')).toBe('0');
            }
            await duration.press('Backspace');
            expect(await duration.evaluate((input) => [
                (input as HTMLInputElement).validity.badInput, input.getAttribute('aria-invalid'),
                input.getAttribute('aria-describedby'), Boolean(document.getElementById('walking-route-duration-error')),
            ])).toEqual([false, null, null, false]);

            const distance = page.getByRole('textbox', { name: enWalkingRoutes.distancePlaceholder });
            expect(await distance.getAttribute('class')).toContain('min-h-[44px]');
            expect(await distance.getAttribute('class')).toContain('focus:ring-[var(--color-primary)]');
            expect(await distance.getAttribute('class')).toContain('focus:outline-[var(--color-primary)]');
            expect(await distance.locator('xpath=../..').getAttribute('class')).toContain('flex-col');
            expect(await distance.getAttribute('type')).toBe('text');
            expect(await distance.getAttribute('inputmode')).toBe('decimal');
            expect(await distance.getAttribute('min')).toBeNull();
            expect(await distance.getAttribute('step')).toBeNull();
            const invalidDistanceValues = [
                '+1', '3abc', ' 1 ', '1.', '1e2', '-1', '9'.repeat(400),
            ];
            await distance.fill(invalidDistanceValues[0]);
            await distance.evaluate((input) => {
                document.body.dataset.distanceFocusCount = '0';
                input.addEventListener('focus', () => {
                    document.body.dataset.distanceFocusCount = String(
                        Number(document.body.dataset.distanceFocusCount) + 1,
                    );
                    document.body.dataset.distanceFocusSnapshot = [
                        input.getAttribute('aria-invalid'), input.getAttribute('aria-describedby'),
                        Boolean(document.getElementById('walking-route-distance-error')),
                    ].join('|');
                });
            });
            let expectedDistanceFocusCount = 0;
            for (const [index, value] of invalidDistanceValues.entries()) {
                if (index > 0) await distance.fill(value);
                expect(await distance.inputValue()).toBe(value);
                const submitCount = index === 0 ? 2 : 1;
                for (let attempt = 0; attempt < submitCount; attempt += 1) {
                    expectedDistanceFocusCount += 1;
                    await save.click();
                    await page.waitForFunction(
                        (count) => document.body.dataset.distanceFocusCount === count,
                        String(expectedDistanceFocusCount),
                    );
                    expect(await page.locator('body').getAttribute('data-distance-focus-snapshot')).toBe(
                        'true|walking-route-distance-error|true');
                    expect(await page.locator('body').getAttribute('data-post-count')).toBe('0');
                }
                await distance.fill('');
                expect(await distance.evaluate((input) => [
                    (input as HTMLInputElement).value,
                    input.getAttribute('aria-invalid'), input.getAttribute('aria-describedby'),
                    Boolean(document.getElementById('walking-route-distance-error')),
                ])).toEqual(['', null, null, false]);
            }

            await setActionFlag('failNextAction'); await save.click(); const englishActionAlert = actionAlert(enWalkingRoutes.createError); await englishActionAlert.waitFor();
            const englishDismissButton = page.getByRole('button', { name: enWalkingRoutes.dismissActionError }); const [dismissClass, dismissBox, atomic, live, alertFocused, buttonFocused, label] = await Promise.all(
                [englishDismissButton.getAttribute('class'), englishDismissButton.boundingBox(), englishActionAlert.getAttribute('aria-atomic'), englishActionAlert.getAttribute('aria-live'),
                    englishActionAlert.evaluate((alert) => document.activeElement === alert), englishDismissButton.evaluate((button) => document.activeElement === button), englishDismissButton.getAttribute('aria-label')]);
            expect([atomic, live, alertFocused, buttonFocused, label, ['min-h-[44px]', 'min-w-[44px]', 'focus-visible:outline'].every((token) => dismissClass?.includes(token)),
                [dismissBox?.width, dismissBox?.height].every((value) => (value ?? 0) >= 44)]).toEqual(['true', null, false, false, enWalkingRoutes.dismissActionError, true, true]);
            await englishDismissButton.focus(); await englishDismissButton.press('Enter'); await englishActionAlert.waitFor({ state: 'detached' });

            await setActionFlag('failNextAction'); await save.click(); await englishActionAlert.waitFor();
            await save.click(); await englishActionAlert.waitFor({ state: 'detached' });
            await page.getByRole('textbox', { name: enWalkingRoutes.namePlaceholder }).waitFor({ state: 'detached' }); expect(await bodyAttr('post-count')).toBe('1');

            await page.evaluate(() => { document.body.dataset.postCount = '0'; delete document.body.dataset.postBody; });
            await page.getByRole('button', { name: enWalkingRoutes.addRoute }).click();
            await page.getByRole('textbox', { name: enWalkingRoutes.namePlaceholder }).fill('Route');
            for (const [index, [value, expected]] of [
                ['0', 0], ['1.5', 1.5], ['1,5', 1.5],
            ].entries()) {
                if (index > 0) {
                    await page.getByRole('button', { name: enWalkingRoutes.addRoute }).click();
                    await page.getByRole('textbox', { name: enWalkingRoutes.namePlaceholder }).fill('Route');
                }
                await distance.fill(String(value));
                expect(await distance.inputValue()).toBe(value);
                await save.click();
                await page.waitForFunction(
                    (count) => document.body.dataset.postCount === count,
                    String(index + 1),
                );
                await page.getByRole('textbox', { name: enWalkingRoutes.namePlaceholder }).waitFor({
                    state: 'detached',
                });
                const postBody = await page.locator('body').getAttribute('data-post-body');
                expect(JSON.parse(postBody ?? '{}')).toMatchObject({
                    distance_km: expected,
                    duration_minutes: null,
                });
            }

            await page.getByRole('button', { name: enWalkingRoutes.addRoute }).click();
            await page.getByRole('textbox', { name: enWalkingRoutes.namePlaceholder }).fill('Route');
            await duration.pressSequentially('-'); await save.click();
            const durationAlert = actionAlert(enWalkingRoutes.durationError); await durationAlert.waitFor();
            const logButtons = page.locator(`button[title="${enWalkingRoutes.logWalk}"]`); const favoriteButtons = page.locator(`button[title="${enWalkingRoutes.favorite}"]`); const deleteButtons = page.locator(`button[title="${enWalkingRoutes.delete}"]`);
            const routeControls = [logButtons, favoriteButtons, deleteButtons];
            const disabledStates = () => Promise.all(routeControls.map((controls) => controls.evaluateAll(
                (buttons) => buttons.every((button) => (button as HTMLButtonElement).disabled))));
            const forceClick = (controls: typeof logButtons) => controls.first().evaluate((button) => {
                (button as HTMLButtonElement).disabled = false; (button as HTMLButtonElement).click();
            });
            const settleDeferredFailure = () => page.evaluate(() => Reflect.get(globalThis,
                'resolveDeferredAction')({ ok: false, json: async () => ({}) }));
            const updateActionAlert = actionAlert(enWalkingRoutes.updateError);
            await page.evaluate((message) => {
                Object.assign(document.body.dataset, { postAttemptCount: '0', patchAttemptCount: '0', deleteAttemptCount: '0', updateAlertMounts: '0' });
                const root = document.querySelector('#root');
                if (!root) throw new Error('missing test root');
                new MutationObserver((records) => {
                    if (records.flatMap((record) => Array.from(record.addedNodes)).some((node) =>
                        node instanceof Element && (node.matches('[role="alert"]')
                            ? node.textContent?.includes(message) : Array.from(node.querySelectorAll(
                                '[role="alert"]')).some((alert) => alert.textContent?.includes(message)))))
                        document.body.dataset.updateAlertMounts = String(Number(document.body.dataset.updateAlertMounts) + 1);
                }).observe(root, { childList: true, subtree: true });
            }, enWalkingRoutes.updateError);
            const lastLogWalkButton = logButtons.last(); await lastLogWalkButton.scrollIntoViewIfNeeded();
            await lastLogWalkButton.evaluate((button, favoriteLabel) => {
                document.body.dataset.deferNextAction = 'true'; (button as HTMLButtonElement).click();
                Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
                    candidate.getAttribute('aria-label') === favoriteLabel)?.click();
            }, enWalkingRoutes.favorite);
            await page.waitForFunction(() => document.body.dataset.patchAttemptCount === '1');
            expect([await disabledStates(), await lastLogWalkButton.locator('.animate-spin').count(),
                await logButtons.first().locator('.animate-spin').count(), await save.isDisabled()])
                .toEqual([[true, true, true], 1, 0, true]);
            await forceClick(deleteButtons); expect([
                await page.getByRole('alertdialog').count(), await bodyAttr('delete-attempt-count')])
                .toEqual([0, '0']);
            await settleDeferredFailure(); await updateActionAlert.waitFor();
            await page.waitForFunction((message) => {
                const alert = Array.from(document.querySelectorAll('[role="alert"]'))
                    .find((element) => element.textContent?.includes(message));
                const rect = alert?.getBoundingClientRect();
                return rect !== undefined && rect.top >= 0 && rect.bottom <= window.innerHeight;
            }, enWalkingRoutes.updateError);
            expect([await duration.getAttribute('aria-invalid'), await durationAlert.count(), await updateActionAlert.getAttribute('tabindex'), await updateActionAlert.evaluate((alert) => document.activeElement === alert), await bodyAttr('update-alert-mounts')]).toEqual(['true', 1, '-1', true, '1']);

            await setActionFlag('deferNextAction'); await favoriteButtons.first().click();
            await page.waitForFunction(() => document.body.dataset.patchAttemptCount === '2');
            await updateActionAlert.waitFor({ state: 'detached' });
            expect([await bodyAttr('update-alert-mounts'), await disabledStates()]).toEqual(['1', [true, true, true]]);
            await settleDeferredFailure(); await updateActionAlert.waitFor();
            expect([await bodyAttr('update-alert-mounts'), await updateActionAlert.evaluate(
                (alert) => document.activeElement === alert)]).toEqual(['2', false]);
            const updateDismissButton = page.getByRole('button', { name: enWalkingRoutes.dismissActionError });
            await updateDismissButton.focus(); await updateDismissButton.press('Space');
            await updateActionAlert.waitFor({ state: 'detached' }); expect(await durationAlert.count()).toBe(1);

            await duration.press('Backspace'); await setActionFlag('deferNextAction'); await save.click();
            await page.waitForFunction(() => document.body.dataset.postAttemptCount === '1');
            expect(await disabledStates()).toEqual([true, true, true]); await forceClick(logButtons);
            expect(await bodyAttr('patch-attempt-count')).toBe('2'); await settleDeferredFailure();
            const createActionAlert = actionAlert(enWalkingRoutes.createError); await createActionAlert.waitFor();
            await page.getByRole('button', { name: enWalkingRoutes.dismissActionError }).click();

            await deleteButtons.first().click(); const deleteDialog = page.getByRole('alertdialog');
            await deleteDialog.waitFor(); await forceClick(logButtons);
            expect(await bodyAttr('patch-attempt-count')).toBe('2'); await deleteDialog.getByRole(
                'button', { name: enWalkingRoutes.cancel }).click(); await deleteDialog.waitFor({ state: 'detached' });

            await deleteButtons.first().click();
            await setActionFlag('deferNextAction'); await page.getByRole('alertdialog').getByRole(
                'button', { name: enWalkingRoutes.delete }).click();
            await page.waitForFunction(() => document.body.dataset.deleteAttemptCount === '1');
            expect([await page.getByRole('alertdialog').count(), await disabledStates(),
                await logButtons.first().locator('.animate-spin').count()]).toEqual([0, [true, true, true], 1]);
            await forceClick(logButtons); expect(await bodyAttr('patch-attempt-count')).toBe('2');
            await page.evaluate(() => { document.documentElement.lang = 'ja'; });
            await settleDeferredFailure(); const deleteActionAlert = actionAlert(jaWalkingRoutes.deleteError);
            await deleteActionAlert.waitFor();
            expect([await deleteActionAlert.evaluate((alert) => alert.closest('[inert]')),
                await deleteActionAlert.evaluate((alert) => document.activeElement === alert),
                await page.getByRole('button', { name: jaWalkingRoutes.dismissActionError })
                    .getAttribute('aria-label')]).toEqual([null, false, jaWalkingRoutes.dismissActionError]);
            expect(pageErrors).toEqual([]);
        } finally {
            await browser.close();
        }
    }, 30_000);
});
