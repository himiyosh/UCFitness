'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

// 浮遊する絵文字パーティクル設定
const PARTICLES = [
    { emoji: '🏃', x: 8, y: 12, size: 'text-4xl', delay: '0s', dur: '3s' },
    { emoji: '⚡', x: 82, y: 8, size: 'text-3xl', delay: '0.4s', dur: '2.5s' },
    { emoji: '🔥', x: 15, y: 75, size: 'text-3xl', delay: '0.8s', dur: '3.2s' },
    { emoji: '💪', x: 88, y: 70, size: 'text-4xl', delay: '0.2s', dur: '2.8s' },
    { emoji: '🎯', x: 5, y: 45, size: 'text-2xl', delay: '1s', dur: '3.5s' },
    { emoji: '✨', x: 92, y: 40, size: 'text-2xl', delay: '0.6s', dur: '2.6s' },
    { emoji: '🏆', x: 25, y: 88, size: 'text-3xl', delay: '1.2s', dur: '3s' },
    { emoji: '👟', x: 75, y: 85, size: 'text-2xl', delay: '0.3s', dur: '2.9s' },
    { emoji: '💥', x: 50, y: 5, size: 'text-2xl', delay: '0.7s', dur: '3.1s' },
    { emoji: '🌟', x: 40, y: 90, size: 'text-3xl', delay: '1.1s', dur: '2.7s' },
];

export default function SplashScreen() {
    const [isVisible, setIsVisible] = useState(true);
    const [shouldRender, setShouldRender] = useState(true);
    const [progress, setProgress] = useState(0);
    const t = useTranslations('Splash');

    // スキップ機能: セッションストレージや設定で自動スキップされる
    const skipSplash = useCallback(() => {
        setIsVisible(false);
        setTimeout(() => setShouldRender(false), 500);
    }, []);

    useEffect(() => {
        // prefers-reduced-motion: アニメーションをスキップ
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            setIsVisible(false);
            setShouldRender(false);
            return;
        }

        // セッション内でスプラッシュ済みならスキップ
        try {
            const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');
            if (hasSeenSplash) {
                setIsVisible(false);
                setShouldRender(false);
                return;
            }
            sessionStorage.setItem('hasSeenSplash', 'true');
        } catch {
            // sessionStorage が利用不可（プライベートブラウジング等）の場合はそのまま続行
        }

        // プログレスカウンターアニメーション
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                return prev + 2;
            });
        }, 20);

        // フェードアウト開始
        const timer = setTimeout(() => {
            setIsVisible(false);
        }, 2800);

        // アンマウント
        const unmountTimer = setTimeout(() => {
            setShouldRender(false);
        }, 3300);

        return () => {
            clearTimeout(timer);
            clearTimeout(unmountTimer);
            clearInterval(interval);
        };
    }, []);

    if (!shouldRender) return null;

    return (
        <div
            className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-opacity duration-500 ease-in-out overflow-hidden ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 25%, #f093fb 50%, #f5576c 75%, #fda085 100%)',
                backgroundSize: '400% 400%',
                animation: isVisible ? 'splashGradientShift 3s ease infinite' : 'none',
            }}
            role="status"
            aria-label={t('loading')}
        >
            {/* キラキラパーティクル背景 */}
            <div className="absolute inset-0 overflow-hidden">
                {/* 浮遊する絵文字たち */}
                {PARTICLES.map((p, i) => (
                    <span
                        key={i}
                        className={`absolute ${p.size} splash-particle`}
                        style={{
                            left: `${p.x}%`,
                            top: `${p.y}%`,
                            animationDelay: p.delay,
                            animationDuration: p.dur,
                        }}
                    >
                        {p.emoji}
                    </span>
                ))}

                {/* 浮遊する円形バブル */}
                <div className="absolute w-32 h-32 rounded-full bg-white/10 splash-bubble" style={{ left: '10%', top: '20%', animationDelay: '0s' }} />
                <div className="absolute w-20 h-20 rounded-full bg-yellow-300/15 splash-bubble" style={{ left: '70%', top: '15%', animationDelay: '0.5s' }} />
                <div className="absolute w-24 h-24 rounded-full bg-pink-300/10 splash-bubble" style={{ left: '50%', top: '70%', animationDelay: '1s' }} />
                <div className="absolute w-16 h-16 rounded-full bg-cyan-300/15 splash-bubble" style={{ left: '20%', top: '60%', animationDelay: '1.5s' }} />
                <div className="absolute w-28 h-28 rounded-full bg-white/8 splash-bubble" style={{ left: '80%', top: '55%', animationDelay: '0.3s' }} />
            </div>

            {/* メインコンテンツ */}
            <div className="relative z-10 flex flex-col items-center splash-pop-in">
                {/* アイコン＋リング */}
                <div className="relative mb-6">
                    {/* 外側リングアニメーション */}
                    <div className="absolute -inset-4 rounded-full border-4 border-white/30 splash-ring" />
                    <div className="absolute -inset-8 rounded-full border-2 border-white/15 splash-ring-outer" />

                    {/* メインアイコン */}
                    <div className="bg-white/95 backdrop-blur-sm p-5 rounded-2xl shadow-2xl relative flex items-center justify-center overflow-visible">
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-yellow-200/30 to-pink-200/30" />
                        <span className="relative text-5xl splash-run-person">🏃‍♂️</span>
                    </div>
                </div>

                {/* タイトル */}
                <h1 className="text-white text-4xl font-black tracking-tight mt-2 splash-title-reveal">
                    <span className="inline-block splash-letter" style={{ animationDelay: '0.3s' }}>G</span>
                    <span className="inline-block splash-letter" style={{ animationDelay: '0.35s' }}>E</span>
                    <span className="inline-block splash-letter" style={{ animationDelay: '0.4s' }}>T</span>
                    <span className="inline-block mx-2" />
                    <span className="inline-block splash-letter" style={{ animationDelay: '0.5s' }}>M</span>
                    <span className="inline-block splash-letter" style={{ animationDelay: '0.55s' }}>O</span>
                    <span className="inline-block splash-letter" style={{ animationDelay: '0.6s' }}>V</span>
                    <span className="inline-block splash-letter" style={{ animationDelay: '0.65s' }}>I</span>
                    <span className="inline-block splash-letter" style={{ animationDelay: '0.7s' }}>N</span>
                    <span className="inline-block splash-letter" style={{ animationDelay: '0.75s' }}>G</span>
                    <span className="inline-block splash-letter" style={{ animationDelay: '0.8s' }}>!</span>
                </h1>

                {/* サブテキスト */}
                <p className="text-white/70 text-sm font-medium mt-2 tracking-widest uppercase splash-fade-up" style={{ animationDelay: '1s' }}>
                    {t('subtitle')} 🎉
                </p>

                {/* プログレスバー */}
                <div className="mt-8 w-56 sm:w-64 splash-fade-up" style={{ animationDelay: '0.8s' }}>
                    <div className="flex justify-between text-xs font-bold text-white/60 mb-2 uppercase tracking-wider">
                        <span>{t('loading')}</span>
                        <span className="tabular-nums">{progress}%</span>
                    </div>
                    <div className="h-3 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm shadow-inner" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={t('loading')}>
                        <div
                            className="h-full rounded-full transition-all duration-75 ease-out shadow-lg"
                            style={{
                                width: `${progress}%`,
                                background: 'linear-gradient(90deg, #fda085, #f5576c, #f093fb, #667eea)',
                                backgroundSize: '200% 100%',
                                animation: 'splashProgressShimmer 1.5s ease infinite',
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
