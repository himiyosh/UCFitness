'use client';

import { useCallback, useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

export default function SplashScreen() {
    const [isVisible, setIsVisible] = useState(true);
    const [shouldRender, setShouldRender] = useState(true);
    const [progress, setProgress] = useState(0);
    const t = useTranslations('Splash');

    const hideSplash = useCallback(() => {
        setIsVisible(false);
        setTimeout(() => setShouldRender(false), 500);
    }, []);

    useEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            setIsVisible(false);
            setShouldRender(false);
            return;
        }

        try {
            const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');
            if (hasSeenSplash) {
                setIsVisible(false);
                setShouldRender(false);
                return;
            }
            sessionStorage.setItem('hasSeenSplash', 'true');
        } catch {
            // sessionStorage が利用できない環境でも、短時間のローダーとして継続する。
        }

        const interval = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                return prev + 4;
            });
        }, 32);

        const timer = setTimeout(hideSplash, 1200);

        return () => {
            clearInterval(interval);
            clearTimeout(timer);
        };
    }, [hideSplash]);

    if (!shouldRender) return null;

    return (
        <div
            className={`fixed inset-0 z-[100] flex items-center justify-center bg-[var(--color-bg)] px-6 transition-opacity duration-500 ease-out ${isVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            role="status"
            aria-label={t('loading')}
        >
            <div className="w-full max-w-sm rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-[var(--color-text)] shadow-[var(--shadow-professional-soft)]">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-inverse-surface)] text-[var(--color-inverse-text)]">
                        <BrandMark />
                    </div>
                    <div>
                        <p className="text-lg font-semibold tracking-tight">UCFitness</p>
                        <p className="text-sm font-medium text-[var(--color-text-muted)]">{t('subtitle')}</p>
                    </div>
                </div>

                <div className="mt-6">
                    <div className="mb-2 flex justify-between text-xs font-semibold text-[var(--color-text-muted)]">
                        <span>{t('loading')}</span>
                        <span className="tabular-nums">{progress}%</span>
                    </div>
                    <div
                        className="h-2 rounded-full bg-[var(--color-surface-muted)]"
                        role="progressbar"
                        aria-valuenow={progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={t('loading')}
                    >
                        <div
                            className="h-full rounded-full bg-[var(--theme-primary)] transition-[width] duration-100"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function BrandMark() {
    return (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 15.5 8.5 11l3 3L20 5.5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 19h14" />
        </svg>
    );
}
