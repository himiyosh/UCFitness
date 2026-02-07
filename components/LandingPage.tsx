'use client';

import AuthButtons from './AuthButtons';
import { useTranslations } from 'next-intl';

export default function LandingPage() {
    const t = useTranslations('Landing');

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background Decorations - More colorful! */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-1/2 -left-1/2 w-[1000px] h-[1000px] bg-gradient-to-r from-[var(--accent-coral)]/20 to-[var(--accent-pink)]/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute top-1/2 -right-1/2 w-[800px] h-[800px] bg-gradient-to-r from-[var(--accent-turquoise)]/20 to-[var(--accent-lime)]/20 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-r from-[var(--accent-yellow)]/20 to-[var(--accent-coral)]/20 rounded-full blur-3xl"></div>

                {/* Floating emojis for fun atmosphere */}
                <div className="absolute top-20 left-[10%] text-4xl animate-float opacity-60">🏃</div>
                <div className="absolute top-40 right-[15%] text-3xl animate-float-delayed opacity-60">💪</div>
                <div className="absolute bottom-32 left-[20%] text-3xl animate-float opacity-60">🎯</div>
                <div className="absolute top-1/3 left-[5%] text-2xl animate-float-delayed opacity-50">✨</div>
                <div className="absolute bottom-20 right-[10%] text-4xl animate-float opacity-60">🏆</div>
                <div className="absolute top-1/4 right-[25%] text-2xl animate-float-delayed opacity-50">⚡</div>
            </div>

            <div className="relative z-10 w-full max-w-4xl px-6 text-center">
                {/* Logo / Icon - Rainbow border */}
                <div className="mx-auto mb-8 w-24 h-24 p-1 rounded-3xl animate-rainbow transform rotate-12 hover:rotate-0 transition-transform duration-500 shadow-xl">
                    <div className="w-full h-full bg-[var(--theme-primary)] rounded-[20px] flex items-center justify-center">
                        <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                </div>

                <h1 className="text-5xl sm:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-coral)] via-indigo-600 to-[var(--accent-turquoise)] mb-6 tracking-tight drop-shadow-sm">
                    {t('title')}
                </h1>

                <p className="text-xl sm:text-2xl text-gray-600 mb-12 max-w-2xl mx-auto font-medium leading-relaxed">
                    {t('subtitle')}
                    <br />
                    <span className="text-[var(--accent-coral)] font-bold">{t('compete')}</span>, <span className="text-[var(--accent-turquoise)] font-bold">{t('collectBadges')}</span>, {t.rich('stayActive', { span: (chunks) => <span className="text-[var(--accent-lime)] font-bold">{chunks}</span> })}
                </p>

                {/* Features Grid - Colorful cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16 text-left">
                    <div className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl border-2 border-transparent hover:border-[var(--accent-coral)] shadow-lg hover:shadow-xl hover:shadow-[var(--accent-coral)]/20 transition-all duration-300 animate-bounce-hover group">
                        <div className="w-12 h-12 bg-gradient-to-br from-[var(--accent-coral)] to-[var(--accent-pink)] rounded-xl flex items-center justify-center mb-4 text-white shadow-lg group-hover:scale-110 transition-transform">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">{t('features.leaderboards.title')}</h3>
                        <p className="text-sm text-gray-600">{t('features.leaderboards.desc')}</p>
                    </div>

                    <div className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl border-2 border-transparent hover:border-[var(--accent-turquoise)] shadow-lg hover:shadow-xl hover:shadow-[var(--accent-turquoise)]/20 transition-all duration-300 animate-bounce-hover group">
                        <div className="w-12 h-12 bg-gradient-to-br from-[var(--accent-turquoise)] to-[var(--accent-lime)] rounded-xl flex items-center justify-center mb-4 text-white shadow-lg group-hover:scale-110 transition-transform">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">{t('features.battles.title')}</h3>
                        <p className="text-sm text-gray-600">{t('features.battles.desc')}</p>
                    </div>

                    <div className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl border-2 border-transparent hover:border-[var(--accent-yellow)] shadow-lg hover:shadow-xl hover:shadow-[var(--accent-yellow)]/20 transition-all duration-300 animate-bounce-hover group">
                        <div className="w-12 h-12 bg-gradient-to-br from-[var(--accent-yellow)] to-[var(--accent-coral)] rounded-xl flex items-center justify-center mb-4 text-white shadow-lg group-hover:scale-110 transition-transform">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                        </div>
                        <h3 className="font-bold text-gray-900 mb-2">{t('features.badges.title')}</h3>
                        <p className="text-sm text-gray-600">{t('features.badges.desc')}</p>
                    </div>
                </div>

                {/* Call to Action - More vibrant */}
                <div className="flex flex-col items-center">
                    <div className="scale-125 transform transition-transform hover:scale-130">
                        <AuthButtons />
                    </div>
                    <p className="mt-6 text-sm text-gray-500 font-medium flex items-center gap-2">
                        <span className="text-lg">📱</span>
                        {t('connectFitbit')}
                    </p>
                </div>
            </div>

            <footer className="absolute bottom-4 text-center text-xs text-gray-400">
                &copy; {new Date().getFullYear()} Studio344
            </footer>
        </div>
    );
}
