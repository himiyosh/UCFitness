import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDialogFocusRestorer } from './useDialogFocus';

const originalHTMLElementDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');

class TestHTMLElement {
  isConnected = true;
  inert = false;

  focus(): void {}
}

function setConnected(element: HTMLElement, isConnected: boolean): void {
  Object.defineProperty(element, 'isConnected', {
    configurable: true,
    value: isConnected,
  });
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    value: TestHTMLElement,
  });
});

afterAll(() => {
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
});
