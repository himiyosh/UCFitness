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
            {/* チャレンジ作成ボタン */}
            <div className="flex justify-end">
                <button
                    onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl text-sm font-bold text-white bg-[var(--theme-primary)] hover:opacity-90 hover:scale-105 active:scale-95 transition-all shadow-md shadow-[var(--theme-primary)]/20"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t('create')}
                </button>
            </div>

            {/* チャレンジ一覧 */}
            <ChallengeList key={refreshKey} currentUserId={currentUserId} />

            {/* 作成モーダル */}
            <CreateChallengeModal
                isOpen={showCreate}
                onClose={() => setShowCreate(false)}
                onCreated={() => setRefreshKey(k => k + 1)}
            />
        </div>
    );
}
