'use client';

import { useState } from 'react';
import ChallengeList from '@/components/challenge/ChallengeList';
import CreateChallengeModal from '@/components/challenge/CreateChallengeModal';
import { useTranslations } from 'next-intl';

// ============================================
// チャレンジページ クライアントラッパー
// モーダル開閉とチャレンジ一覧を管理
// ============================================

interface ChallengesPageClientProps {
    currentUserId?: string;
}

export default function ChallengesPageClient({ currentUserId }: ChallengesPageClientProps) {
    const t = useTranslations('Challenge');
    const [showCreate, setShowCreate] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <div className="space-y-6">
            {/* チャレンジ一覧 */}
            <ChallengeList key={refreshKey} currentUserId={currentUserId} />

            {/* 作成は参加中チャレンジ確認後の補助導線 */}
            <div className="flex justify-end border-t border-[var(--color-border)] pt-4">
                <button
                    onClick={() => setShowCreate(true)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--color-competition)]/35 px-4 py-2 text-sm font-bold text-[var(--color-competition-strong)] transition-colors hover:bg-[var(--color-competition-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)]"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t('create')}
                </button>
            </div>

            {/* 作成モーダル */}
            <CreateChallengeModal
                isOpen={showCreate}
                onClose={() => setShowCreate(false)}
                onCreated={() => setRefreshKey(k => k + 1)}
            />
        </div>
    );
}
