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
                    globalThis.fetch = async (_input, init) => {
                        if (init?.method && document.body.dataset.failNextAction === 'true') {
                            delete document.body.dataset.failNextAction;
                            return {ok: false, json: async () => ({})};
                        }
                        if (init?.method === 'POST') {
                            const body = JSON.parse(String(init.body));
                            document.body.dataset.postCount = String(Number(document.body.dataset.postCount) + 1);
                            document.body.dataset.postBody = JSON.stringify(body);
                            return {ok: true, json: async () => ({route: {
                                id: 'route-' + document.body.dataset.postCount,
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

            await page.evaluate(() => {
                document.body.dataset.failNextAction = 'true';
            });
            await save.click();
            const englishActionAlert = page.getByRole('alert').filter({
                hasText: enWalkingRoutes.createError,
            });
            await englishActionAlert.waitFor();
            expect(await englishActionAlert.getAttribute('aria-atomic')).toBe('true');
            expect(await englishActionAlert.getAttribute('aria-live')).toBeNull();
            expect(await englishActionAlert.evaluate(
                (alert) => document.activeElement === alert,
            )).toBe(false);
            const englishDismissButton = page.getByRole('button', {
                name: enWalkingRoutes.dismissActionError,
            });
            expect(await englishDismissButton.evaluate(
                (button) => document.activeElement === button,
            )).toBe(false);
            expect(await englishDismissButton.getAttribute('aria-label')).not.toBe('Close');
            const dismissClass = await englishDismissButton.getAttribute('class');
            expect(dismissClass).toContain('min-h-[44px]');
            expect(dismissClass).toContain('min-w-[44px]');
            expect(dismissClass).toContain('focus-visible:outline');
            const dismissBox = await englishDismissButton.boundingBox();
            expect(dismissBox?.width).toBeGreaterThanOrEqual(44);
            expect(dismissBox?.height).toBeGreaterThanOrEqual(44);
            await englishDismissButton.focus();
            expect(await englishDismissButton.evaluate((button) => document.activeElement === button)).toBe(true);
            await englishDismissButton.press('Enter');
            await englishActionAlert.waitFor({ state: 'detached' });

            await page.evaluate(() => {
                document.documentElement.lang = 'ja';
                document.body.dataset.failNextAction = 'true';
            });
            await save.click();
            const japaneseActionAlert = page.getByRole('alert').filter({
                hasText: jaWalkingRoutes.createError,
            });
            await japaneseActionAlert.waitFor();
            expect(await page.getByRole('button', {
                name: jaWalkingRoutes.dismissActionError,
            }).getAttribute('aria-label')).not.toBe('Close');
            await page.evaluate(() => {
                document.documentElement.lang = 'en';
            });
            await page.getByRole('button', { name: jaWalkingRoutes.save }).click();
            await japaneseActionAlert.waitFor({ state: 'detached' });
            await page.getByRole('textbox', { name: jaWalkingRoutes.namePlaceholder }).waitFor({
                state: 'detached',
            });
            expect(await page.locator('body').getAttribute('data-post-count')).toBe('1');

            await page.evaluate(() => {
                document.body.dataset.postCount = '0';
                delete document.body.dataset.postBody;
            });
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
            await duration.pressSequentially('-');
            await save.click();
            const durationAlert = page.getByRole('alert').filter({
                hasText: enWalkingRoutes.durationError,
            });
            await durationAlert.waitFor();
            await page.evaluate(() => {
                document.body.dataset.failNextAction = 'true';
            });
            const lastLogWalkButton = page.getByRole('button', {
                name: enWalkingRoutes.logWalk,
            }).last();
            await lastLogWalkButton.scrollIntoViewIfNeeded();
            await lastLogWalkButton.focus();
            await lastLogWalkButton.press('Enter');
            const updateActionAlert = page.getByRole('alert').filter({
                hasText: enWalkingRoutes.updateError,
            });
            await updateActionAlert.waitFor();
            await page.waitForFunction((message) => {
                const alert = Array.from(document.querySelectorAll('[role="alert"]'))
                    .find((element) => element.textContent?.includes(message));
                const rect = alert?.getBoundingClientRect();
                return rect !== undefined && rect.top >= 0 && rect.bottom <= window.innerHeight;
            }, enWalkingRoutes.updateError);
            expect(await duration.getAttribute('aria-invalid')).toBe('true');
            expect(await durationAlert.count()).toBe(1);
            expect(await updateActionAlert.getAttribute('tabindex')).toBe('-1');
            expect(await updateActionAlert.evaluate(
                (alert) => document.activeElement === alert,
            )).toBe(true);
            const updateDismissButton = page.getByRole('button', {
                name: enWalkingRoutes.dismissActionError,
            });
            await page.keyboard.press('Tab');
            expect(await updateDismissButton.evaluate(
                (button) => document.activeElement === button,
            )).toBe(true);
            await updateDismissButton.press('Space');
            await updateActionAlert.waitFor({ state: 'detached' });
            expect(await durationAlert.count()).toBe(1);
            expect(pageErrors).toEqual([]);
        } finally {
            await browser.close();
        }
    }, 30_000);
});
