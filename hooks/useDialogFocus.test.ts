import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDialogFocusRestorer } from './useDialogFocus';

const originalHTMLElementDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');

class TestHTMLElement {
  isConnected = true;
  inert = false;

  focus(): void {}
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
    const restoreFocus = createDialogFocusRestorer(null, fallbackRef.current);
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
    const restoreFocus = createDialogFocusRestorer(null, fallbackRef.current);
    const initialFocus = vi.spyOn(initialFallback, 'focus');

    fallbackRef.current = null;
    restoreFocus();

    expect(initialFocus).toHaveBeenCalledOnce();
  });

  it('直前のactive elementが有効ならfallbackより優先してfocusを戻す', () => {
    const previouslyFocused = new HTMLElement();
    const fallback = new HTMLElement();
    const restoreFocus = createDialogFocusRestorer(previouslyFocused, fallback);
    const previousFocus = vi.spyOn(previouslyFocused, 'focus');
    const fallbackFocus = vi.spyOn(fallback, 'focus');

    restoreFocus();

    expect(previousFocus).toHaveBeenCalledOnce();
    expect(fallbackFocus).not.toHaveBeenCalled();
  });
});
