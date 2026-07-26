import { useEffect, useRef } from 'react';

import type { RefObject } from 'react';

interface UseDialogFocusOptions {
  isOpen: boolean;
  onClose: () => void;
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  canClose?: () => boolean;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface DialogStackEntry {
  id: symbol;
  overlay: HTMLElement;
}

const dialogStack: DialogStackEntry[] = [];
const originalInertStates = new Map<HTMLElement, boolean>();
let originalBodyOverflow = '';

function refreshDialogStack(): void {
  if (dialogStack.length === 0) {
    document.body.style.overflow = originalBodyOverflow;
    originalInertStates.forEach((wasInert, element) => {
      if (element.isConnected) element.inert = wasInert;
    });
    originalInertStates.clear();
    return;
  }

  const topOverlay = dialogStack[dialogStack.length - 1].overlay;
  document.body.style.overflow = 'hidden';
  Array.from(document.body.children).forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    if (!originalInertStates.has(element)) {
      originalInertStates.set(element, element.inert);
    }
    const isDialogLiveRegion = element.hasAttribute('data-dialog-live-region');
    element.inert = element !== topOverlay && !isDialogLiveRegion;
  });
}

function isVisibleFocusable(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== 'none'
    && style.visibility !== 'hidden'
    && !element.closest('[hidden], [inert]')
    && rect.width > 0
    && rect.height > 0
  );
}

function isAvailableFocusTarget(element: HTMLElement | null): element is HTMLElement {
  if (
    !(element instanceof HTMLElement)
    || !element.isConnected
    || element.inert
    || element.matches(':disabled, [aria-disabled="true"]')
    || element.closest('[hidden], [inert], [aria-hidden="true"]')
  ) return false;

  let currentElement: HTMLElement | null = element;
  while (currentElement) {
    const style = window.getComputedStyle(currentElement);
    if (style.display === 'none' || style.visibility !== 'visible' || style.opacity === '0') {
      return false;
    }
    currentElement = currentElement.parentElement;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function createDialogFocusRestorer(
  previouslyFocused: HTMLElement | null,
  initialFallbackFocusTarget: HTMLElement | null,
  getCurrentFallbackFocusTarget: () => HTMLElement | null = () => null,
  getCurrentMainFocusTarget: () => HTMLElement | null = () => null,
): () => void {
  return () => {
    const focusTargetGetters = [
      () => previouslyFocused,
      () => initialFallbackFocusTarget,
      getCurrentFallbackFocusTarget,
      getCurrentMainFocusTarget,
    ];
    for (const getFocusTarget of focusTargetGetters) {
      const focusTarget = getFocusTarget();
      if (isAvailableFocusTarget(focusTarget)) {
        focusTarget.focus();
        return;
      }
    }
  };
}

export function useDialogFocus({
  isOpen,
  onClose,
  dialogRef,
  initialFocusRef,
  fallbackFocusRef,
  canClose,
}: UseDialogFocusOptions): void {
  const onCloseRef = useRef(onClose);
  const canCloseRef = useRef(canClose);

  useEffect(() => {
    onCloseRef.current = onClose;
    canCloseRef.current = canClose;
  }, [canClose, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const id = Symbol('dialog');
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const initialFallbackFocusTarget = fallbackFocusRef?.current ?? null;
    const getCurrentFallbackFocusTarget = (): HTMLElement | null => (
      fallbackFocusRef?.current ?? null
    );
    const getCurrentMainFocusTarget = (): HTMLElement | null => (
      document.getElementById('main-page-content')
    );
    const restoreFocus = createDialogFocusRestorer(
      previouslyFocused,
      initialFallbackFocusTarget,
      getCurrentFallbackFocusTarget,
      getCurrentMainFocusTarget,
    );
    const overlayElement = dialogRef.current?.parentElement ?? null;
    if (!overlayElement) return;

    if (dialogStack.length === 0) {
      originalBodyOverflow = document.body.style.overflow;
    }
    dialogStack.push({ id, overlay: overlayElement });
    refreshDialogStack();

    const focusFrame = requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (initialFocusRef?.current ?? firstFocusable ?? dialogRef.current)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (dialogStack[dialogStack.length - 1]?.id !== id) return;
      if (event.key === 'Escape') {
        if (canCloseRef.current?.() ?? true) {
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(isVisibleFocusable);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      if (!dialogRef.current.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      const stackIndex = dialogStack.findIndex((entry) => entry.id === id);
      if (stackIndex >= 0) dialogStack.splice(stackIndex, 1);
      refreshDialogStack();
      restoreFocus();
    };
  }, [dialogRef, fallbackFocusRef, initialFocusRef, isOpen]);
}
