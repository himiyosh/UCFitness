import { build } from 'esbuild';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDialogFocusRestorer } from './useDialogFocus';

const originalHTMLElementDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement'); const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

class TestHTMLElement {
  isConnected = true;
  inert = false;
  disabled = false;
  hidden = false;
  display = 'block'; visibility = 'visible'; opacity = '1';
  width = 100; height = 44;

  focus(): void {}

  matches(selector: string): boolean {
    return selector.includes(':disabled') && this.disabled;
  }

  closest(selector: string): TestHTMLElement | null {
    const isHidden = selector.includes('[hidden]') && this.hidden;
    const isInert = selector.includes('[inert]') && this.inert;
    return isHidden || isInert ? this : null;
  }

  getBoundingClientRect(): { width: number; height: number } { return { width: this.width, height: this.height }; }
}

function setConnected(element: HTMLElement, isConnected: boolean): void {
  Object.defineProperty(element, 'isConnected', {
    configurable: true,
    value: isConnected,
  });
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestHTMLElement });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      getComputedStyle: (element: TestHTMLElement) => ({ display: element.display, visibility: element.visibility, opacity: element.opacity }),
    },
  });
});

afterAll(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
  if (originalHTMLElementDescriptor) {
    Object.defineProperty(globalThis, 'HTMLElement', originalHTMLElementDescriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, 'HTMLElement');
});

describe('createDialogFocusRestorer', () => {
  it('effect開始後にfallback refが差し替わっても開始時の要素へfocusを戻す', () => {
    const initialFallback = new HTMLElement();
    const replacementFallback = new HTMLElement();
    const fallbackRef: { current: HTMLElement | null } = { current: initialFallback };
    const restoreFocus = createDialogFocusRestorer(
      null,
      fallbackRef.current,
      () => fallbackRef.current,
    );
    const initialFocus = vi.spyOn(initialFallback, 'focus');
    const replacementFocus = vi.spyOn(replacementFallback, 'focus');

    fallbackRef.current = replacementFallback;
    restoreFocus();

    expect(initialFocus).toHaveBeenCalledOnce();
    expect(replacementFocus).not.toHaveBeenCalled();
  });

  it('effect開始後にfallback refがnullになっても開始時の要素へfocusを戻す', () => {
    const initialFallback = new HTMLElement();
    const fallbackRef: { current: HTMLElement | null } = { current: initialFallback };
    const restoreFocus = createDialogFocusRestorer(
      null,
      fallbackRef.current,
      () => fallbackRef.current,
    );
    const initialFocus = vi.spyOn(initialFallback, 'focus');

    fallbackRef.current = null;
    restoreFocus();

    expect(initialFocus).toHaveBeenCalledOnce();
  });

  it('直前のactive elementが有効ならfallbackより優先してfocusを戻す', () => {
    const previouslyFocused = new HTMLElement();
    const fallback = new HTMLElement();
    const restoreFocus = createDialogFocusRestorer(
      previouslyFocused,
      fallback,
      () => fallback,
    );
    const previousFocus = vi.spyOn(previouslyFocused, 'focus');
    const fallbackFocus = vi.spyOn(fallback, 'focus');

    restoreFocus();

    expect(previousFocus).toHaveBeenCalledOnce();
    expect(fallbackFocus).not.toHaveBeenCalled();
  });

  it('直前のactive elementがdisabledの場合はfallbackへfocusを戻す', () => {
    const previouslyFocused = new HTMLElement();
    const fallback = new HTMLElement();
    Object.defineProperty(previouslyFocused, 'disabled', { value: true });
    const restoreFocus = createDialogFocusRestorer(previouslyFocused, fallback);
    const previousFocus = vi.spyOn(previouslyFocused, 'focus');
    const fallbackFocus = vi.spyOn(fallback, 'focus');

    restoreFocus();

    expect(previousFocus).not.toHaveBeenCalled();
    expect(fallbackFocus).toHaveBeenCalledOnce();
  });

  it('直前のancestorが透明で開始時fallbackがhiddenの場合はcurrent fallbackへfocusを戻す', () => {
    const previouslyFocused = new HTMLElement();
    const transparentParent = new HTMLElement();
    const initialFallback = new HTMLElement();
    const currentFallback = new HTMLElement();
    Object.defineProperty(transparentParent, 'opacity', { value: '0' });
    Object.defineProperty(previouslyFocused, 'parentElement', { value: transparentParent });
    initialFallback.hidden = true;
    const restoreFocus = createDialogFocusRestorer(
      previouslyFocused,
      initialFallback,
      () => currentFallback,
    );
    const previousFocus = vi.spyOn(previouslyFocused, 'focus');
    const initialFocus = vi.spyOn(initialFallback, 'focus');
    const currentFocus = vi.spyOn(currentFallback, 'focus');

    restoreFocus();

    expect(previousFocus).not.toHaveBeenCalled();
    expect(initialFocus).not.toHaveBeenCalled();
    expect(currentFocus).toHaveBeenCalledOnce();
  });

  it('開始時fallbackが切断された場合はcleanup時のcurrent fallbackへfocusを戻す', () => {
    const initialFallback = new HTMLElement();
    const replacementFallback = new HTMLElement();
    const mainContent = new HTMLElement();
    const fallbackRef: { current: HTMLElement | null } = { current: initialFallback };
    const restoreFocus = createDialogFocusRestorer(
      null,
      initialFallback,
      () => fallbackRef.current,
      () => mainContent,
    );
    const initialFocus = vi.spyOn(initialFallback, 'focus');
    const replacementFocus = vi.spyOn(replacementFallback, 'focus');
    const mainFocus = vi.spyOn(mainContent, 'focus');

    setConnected(initialFallback, false);
    fallbackRef.current = replacementFallback;
    restoreFocus();

    expect(initialFocus).not.toHaveBeenCalled();
    expect(replacementFocus).toHaveBeenCalledOnce();
    expect(mainFocus).not.toHaveBeenCalled();
  });

  it('開始時とcurrent fallbackが無効な場合はcleanup時点の最新mainへfocusを戻す', () => {
    const initialFallback = new HTMLElement();
    const replacementFallback = new HTMLElement();
    const initialMainContent = new HTMLElement();
    const latestMainContent = new HTMLElement();
    const fallbackRef: { current: HTMLElement | null } = { current: initialFallback };
    const mainRef: { current: HTMLElement | null } = { current: initialMainContent };
    const restoreFocus = createDialogFocusRestorer(
      null,
      initialFallback,
      () => fallbackRef.current,
      () => mainRef.current,
    );
    const initialFocus = vi.spyOn(initialFallback, 'focus');
    const replacementFocus = vi.spyOn(replacementFallback, 'focus');
    const initialMainFocus = vi.spyOn(initialMainContent, 'focus');
    const latestMainFocus = vi.spyOn(latestMainContent, 'focus');

    setConnected(initialFallback, false);
    setConnected(replacementFallback, false);
    fallbackRef.current = replacementFallback;
    mainRef.current = latestMainContent;
    restoreFocus();

    expect(initialFocus).not.toHaveBeenCalled();
    expect(replacementFocus).not.toHaveBeenCalled();
    expect(initialMainFocus).not.toHaveBeenCalled();
    expect(latestMainFocus).toHaveBeenCalledOnce();
  });

  it('実Chromeでfocus trapと安全な復帰先を各viewport幅で維持する', async () => {
    const bundle = await build({
      stdin: {
        contents: `
          import { useEffect, useRef, useState } from 'react';
          import { createPortal } from 'react-dom';
          import { createRoot } from 'react-dom/client';
          import { useDialogFocus } from './hooks/useDialogFocus';

          const buttonStyle = { minHeight: '44px', minWidth: '44px' };
          const interactionSnapshot = (element) => {
            const rect = element.getBoundingClientRect();
            return [
              window.scrollX, window.scrollY, rect.top, rect.right, rect.bottom, rect.left,
              rect.width, rect.height, document.documentElement.scrollWidth,
              document.documentElement.scrollHeight,
            ].join('|');
          };

          function Harness() {
            const [isOpen, setIsOpen] = useState(false);
            const [saving, setSaving] = useState(false);
            const [triggerVisible, setTriggerVisible] = useState(true);
            const dialogRef = useRef(null);
            const closeButtonRef = useRef(null);
            const fallbackFocusRef = useRef(null);
            const handleClose = () => {
              if (!saving) setIsOpen(false);
            };
            useDialogFocus({
              isOpen,
              onClose: handleClose,
              dialogRef,
              initialFocusRef: closeButtonRef,
              fallbackFocusRef,
              canClose: () => !saving,
            });
            useEffect(() => {
              document.body.dataset.saving = String(saving);
            }, [saving]);
            const record = (name, element) => {
              document.body.dataset[name] = interactionSnapshot(element);
            };

            return <>
              <main id="main-page-content" tabIndex={-1} style={{ minHeight: '44px' }}>
                {triggerVisible && (
                  <button
                    id="dialog-trigger"
                    type="button"
                    style={buttonStyle}
                    onMouseDown={(event) => record('triggerMouseDown', event.currentTarget)}
                    onClick={(event) => {
                      record('triggerClick', event.currentTarget);
                      setIsOpen(true);
                    }}
                  >
                    Open dialog
                  </button>
                )}
                <button id="dialog-fallback" ref={fallbackFocusRef} type="button" style={buttonStyle}>
                  Nearby action
                </button>
              </main>
              {isOpen && createPortal(
                <div data-dialog-overlay>
                  <section ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}>
                    <button
                      ref={closeButtonRef}
                      type="button"
                      style={buttonStyle}
                      onMouseDown={(event) => record('closeMouseDown', event.currentTarget)}
                      onClick={(event) => {
                        record('closeClick', event.currentTarget);
                        handleClose();
                      }}
                    >
                      Close dialog
                    </button>
                    <button
                      type="button"
                      style={buttonStyle}
                      onClick={() => setSaving((current) => !current)}
                    >
                      {saving ? 'Finish saving' : 'Start saving'}
                    </button>
                    <button
                      type="button"
                      style={buttonStyle}
                      onClick={() => setTriggerVisible(false)}
                    >
                      Remove trigger
                    </button>
                  </section>
                </div>,
                document.body,
              )}
            </>;
          }

          createRoot(document.getElementById('root')).render(<Harness />);`,
        loader: 'tsx',
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: 'iife',
      jsx: 'automatic',
      platform: 'browser',
      write: false,
    });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });

    try {
      for (const width of [320, 375, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        page.setDefaultTimeout(5_000);
        const pageErrors: string[] = []; const consoleErrors: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
        await page.setContent('<div id="root"></div>');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });

        const body = page.locator('body');
        const main = page.locator('#main-page-content');
        const trigger = page.getByRole('button', { name: 'Open dialog' });
        const fallback = page.getByRole('button', { name: 'Nearby action' });

        await trigger.click();
        const dialog = page.getByRole('dialog');
        const closeButton = page.getByRole('button', { name: 'Close dialog' });
        await dialog.waitFor();
        await page.waitForFunction(() => document.activeElement?.textContent === 'Close dialog');
        expect(await body.getAttribute('data-trigger-mouse-down')).toBe(
          await body.getAttribute('data-trigger-click'),
        );
        expect([
          await body.evaluate((element) => element.style.overflow),
          await main.evaluate((element) => Boolean(element.closest('[inert]'))),
          await closeButton.evaluate((element) => document.activeElement === element),
        ]).toEqual(['hidden', true, true]);

        await page.keyboard.press('Shift+Tab');
        expect(await page.getByRole('button', { name: 'Remove trigger' }).evaluate(
          (element) => document.activeElement === element,
        )).toBe(true);
        await page.keyboard.press('Tab');
        expect(await closeButton.evaluate((element) => document.activeElement === element)).toBe(true);

        await page.getByRole('button', { name: 'Start saving' }).click();
        await page.waitForFunction(() => document.body.dataset.saving === 'true');
        await page.keyboard.press('Escape');
        expect(await dialog.count()).toBe(1);
        await page.getByRole('button', { name: 'Finish saving' }).click();
        await page.waitForFunction(() => document.body.dataset.saving === 'false');
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
        expect(await trigger.evaluate((element) => document.activeElement === element)).toBe(true);
        expect([
          await body.evaluate((element) => element.style.overflow),
          await main.evaluate((element) => Boolean(element.closest('[inert]'))),
        ]).toEqual(['', false]);

        await trigger.click();
        await dialog.waitFor();
        await closeButton.click();
        await dialog.waitFor({ state: 'detached' });
        expect(await body.getAttribute('data-close-mouse-down')).toBe(
          await body.getAttribute('data-close-click'),
        );

        await trigger.click();
        await dialog.waitFor();
        await trigger.evaluate((element) => {
          (element as HTMLButtonElement).disabled = true;
        });
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
        expect(await fallback.evaluate((element) => document.activeElement === element)).toBe(true);
        await trigger.evaluate((element) => {
          (element as HTMLButtonElement).disabled = false;
        });

        await trigger.click();
        await dialog.waitFor();
        await trigger.evaluate((element) => {
          (element as HTMLElement).hidden = true;
        });
        await page.locator('#dialog-fallback').evaluate((element) => {
          (element as HTMLElement).hidden = true;
        });
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
        expect(await main.evaluate((element) => document.activeElement === element)).toBe(true);
        await page.locator('#dialog-trigger').evaluate((element) => {
          (element as HTMLElement).hidden = false;
        });
        await page.locator('#dialog-fallback').evaluate((element) => {
          (element as HTMLElement).hidden = false;
        });

        await trigger.click();
        await dialog.waitFor();
        await page.getByRole('button', { name: 'Remove trigger' }).click();
        await trigger.waitFor({ state: 'detached' });
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'detached' });
        expect(await fallback.evaluate((element) => document.activeElement === element)).toBe(true);
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }, 30_000);
});
