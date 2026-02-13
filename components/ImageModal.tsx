'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface ImageModalProps {
    src: string | null;
    alt?: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function ImageModal({ src, alt = '', isOpen, onClose }: ImageModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Prevent scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Keyboard support: Escape to close
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleBackdropClick = useCallback(() => onClose(), [onClose]);

    const handleContentClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    if (!mounted || !isOpen || !src) return null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={alt || 'Image preview'}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={handleBackdropClick}
        >
            <div
                className="relative max-w-4xl max-h-[90vh] w-auto h-auto overflow-hidden rounded-lg shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={handleContentClick}
            >
                <img
                    src={src}
                    alt={alt}
                    className="max-w-full max-h-[90vh] object-contain"
                />
                <button
                    onClick={onClose}
                    aria-label="Close image preview"
                    className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
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
