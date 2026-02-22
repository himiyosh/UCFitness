'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { useTranslations } from 'next-intl';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    toast: (message: string, type?: ToastType) => void;
    success: (message: string) => void;
    error: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // アンマウント時に全タイマーをクリーンアップ
    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            timers.forEach((timer) => clearTimeout(timer));
            timers.clear();
        };
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        const timer = timersRef.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(id);
        }
    }, []);

    const addToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);

        const timer = setTimeout(() => {
            removeToast(id);
        }, 4000);
        timersRef.current.set(id, timer);
    }, [removeToast]);

    const success = useCallback((message: string) => addToast(message, 'success'), [addToast]);
    const error = useCallback((message: string) => addToast(message, 'error'), [addToast]);

    return (
        <ToastContext.Provider value={{ toast: addToast, success, error }}>
            {children}
            <div
                className="fixed bottom-16 sm:bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none max-w-sm w-full sm:w-auto"
                aria-live="polite"
                aria-relevant="additions"
                role="status"
            >
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
    const t = useTranslations('Common');
    const isSuccess = toast.type === 'success';
    const isError = toast.type === 'error';

    return (
        <div
            className={`
        pointer-events-auto
        flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg 
        transform transition-all duration-300 ease-in-out
        animate-in slide-in-from-right-full fade-in
        ${isSuccess ? 'bg-green-50 text-green-900 border border-green-200' : ''}
        ${isError ? 'bg-red-50 text-red-900 border border-red-200' : ''}
        ${!isSuccess && !isError ? 'bg-white text-gray-900 border border-gray-200' : ''}
      `}
            role="alert"
        >
            <div className="flex-shrink-0">
                {isSuccess && (
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                )}
                {isError && (
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                )}
            </div>
            <p className="font-medium text-sm">{toast.message}</p>
            <button
                onClick={onClose}
                className={`ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex h-8 w-8 
          ${isSuccess ? 'text-green-500 hover:bg-green-100' : ''}
          ${isError ? 'text-red-500 hover:bg-red-100' : ''}
          ${!isSuccess && !isError ? 'text-gray-400 hover:text-gray-900 hover:bg-gray-100' : ''}
        `}
            >
                <span className="sr-only">{t('close')}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
}
