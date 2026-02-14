'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

// ============================================
// ShareMilestone — 歩数マイルストーン SNS シェアボタン
// Twitter / LINE でマイルストーン達成をシェア
// ============================================

interface ShareMilestoneProps {
    totalSteps: number;
    bestStreak?: number;
    badgeCount?: number;
    username: string;
}

const MILESTONES = [
    { steps: 1000000, emoji: '🏆', label: '100万歩', labelEn: '1M Steps' },
    { steps: 500000, emoji: '💎', label: '50万歩', labelEn: '500K Steps' },
    { steps: 100000, emoji: '⭐', label: '10万歩', labelEn: '100K Steps' },
    { steps: 50000, emoji: '🎯', label: '5万歩', labelEn: '50K Steps' },
    { steps: 10000, emoji: '🚶', label: '1万歩', labelEn: '10K Steps' },
];

export default function ShareMilestone({ totalSteps, bestStreak, badgeCount, username }: ShareMilestoneProps) {
    const t = useTranslations('Profile');
    const [showMenu, setShowMenu] = useState(false);
    const [copied, setCopied] = useState(false);

    // 達成済みマイルストーンのうち最高のもの
    const milestone = MILESTONES.find(m => totalSteps >= m.steps);

    const shareText = useCallback(() => {
        const streakLine = bestStreak ? `\n🔥 ${t('shareStreak', { days: bestStreak })}` : '';
        const badgeLine = badgeCount ? `\n🏅 ${t('shareBadges', { count: badgeCount })}` : '';
        const text = milestone
            ? `${milestone.emoji} ${t('shareMilestone', { label: t('locale') === 'ja' ? milestone.label : milestone.labelEn })}🎉${streakLine}${badgeLine}\n#UCFitness`
            : `🏃 ${t('shareTracking', { steps: totalSteps.toLocaleString() })}${streakLine}\n#UCFitness`;

        return text;
    }, [milestone, totalSteps, bestStreak, badgeCount, t]);

    const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/user/${username}` : '';

    const shareTwitter = useCallback(() => {
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText())}&url=${encodeURIComponent(shareUrl)}`;
        window.open(url, '_blank', 'width=550,height=420');
        setShowMenu(false);
    }, [shareText, shareUrl]);

    const shareLine = useCallback(() => {
        const url = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText())}`;
        window.open(url, '_blank', 'width=550,height=420');
        setShowMenu(false);
    }, [shareText, shareUrl]);

    const copyToClipboard = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(`${shareText()}\n${shareUrl}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            setShowMenu(false);
        } catch {
            // サイレントフェイル
        }
    }, [shareText, shareUrl]);

    if (!milestone && totalSteps < 10000) return null; // 1万歩未満は非表示

    return (
        <div className="relative">
            <button
                onClick={() => setShowMenu(!showMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all hover:scale-105"
                style={{
                    borderColor: 'var(--theme-primary)',
                    color: 'var(--theme-primary)',
                    background: 'var(--theme-primary-light)',
                }}
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                {t('share')}
            </button>

            {/* コピー成功トースト */}
            {copied && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-gray-900 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap animate-in fade-in slide-in-from-top-1 duration-200">
                    ✅ {t('linkCopied')}
                </div>
            )}

            {/* シェアメニュー */}
            {showMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-2 w-48 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Twitter */}
                        <button
                            onClick={shareTwitter}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                        >
                            <span className="text-base">𝕏</span>
                            <span className="text-sm font-medium text-gray-700">Twitter / X</span>
                        </button>

                        {/* LINE */}
                        <button
                            onClick={shareLine}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                        >
                            <span className="text-base">💬</span>
                            <span className="text-sm font-medium text-gray-700">LINE</span>
                        </button>

                        {/* クリップボードにコピー */}
                        <button
                            onClick={copyToClipboard}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                        >
                            <span className="text-base">📋</span>
                            <span className="text-sm font-medium text-gray-700">{t('copyLink')}</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
