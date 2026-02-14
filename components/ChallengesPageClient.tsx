'use client';

import { useState } from 'react';
import ChallengeList from '@/components/ChallengeList';
import CreateChallengeModal from '@/components/CreateChallengeModal';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';

// ============================================
// チャレンジページ クライアントラッパー
// モーダル開閉とチャレンジ一覧を管理
// ============================================

export default function ChallengesPageClient() {
    const t = useTranslations('Challenge');
    const [showCreate, setShowCreate] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <main className="min-h-screen bg-[var(--theme-page-bg)]">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
                {/* 戻るボタン */}
                <div className="mb-4">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-1 text-sm text-[var(--foreground-muted)] hover:text-[var(--theme-primary)] transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        {t('backToHome')}
                    </Link>
                </div>

                {/* ヘッダー */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 flex items-center gap-2">
                            🎯 {t('title')}
                        </h1>
                        <p className="text-sm text-[var(--foreground-muted)] mt-1">{t('subtitle')}</p>
                    </div>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-[var(--theme-primary)] hover:opacity-90 hover:scale-105 active:scale-95 transition-all shadow-md shadow-[var(--theme-primary)]/20"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        {t('create')}
                    </button>
                </div>

                {/* チャレンジ一覧 */}
                <ChallengeList key={refreshKey} />

                {/* 作成モーダル */}
                <CreateChallengeModal
                    isOpen={showCreate}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => setRefreshKey(k => k + 1)}
                />
            </div>
        </main>
    );
}
