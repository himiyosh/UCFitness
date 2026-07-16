'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useDialogFocus } from '@/hooks/useDialogFocus';

interface ImageModalProps {
    src: string | null;
    alt?: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function ImageModal({ src, alt = '', isOpen, onClose }: ImageModalProps) {
    const [mounted, setMounted] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useDialogFocus({ isOpen: isOpen && Boolean(src), onClose, dialogRef, initialFocusRef: closeButtonRef });

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleBackdropClick = useCallback(() => onClose(), [onClose]);

    const handleContentClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    if (!mounted || !isOpen || !src) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={handleBackdropClick}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={alt || 'Image preview'}
                tabIndex={-1}
                className="relative h-auto max-h-[90dvh] w-auto max-w-4xl overflow-hidden rounded-lg shadow-2xl outline-none animate-in zoom-in-95 duration-200"
                onClick={handleContentClick}
            >
                <img
                    src={src}
                    alt={alt}
                    className="max-w-full max-h-[90vh] object-contain"
                />
                <button
                    ref={closeButtonRef}
                    onClick={onClose}
                    aria-label="Close image preview"
                    className="absolute right-2 top-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>,
        document.body
    );
}
