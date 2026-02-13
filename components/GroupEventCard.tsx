'use client';

import { useTranslations } from 'next-intl';

interface MemberProgress {
    user_id: string;
    name: string;
    image: string | null;
    username: string | null;
    steps: number;
}

interface GroupEvent {
    id: string;
    group_id: string;
    title: string;
    description: string | null;
    target_steps: number;
    start_date: string;
    end_date: string;
    reward_uc: number;
    is_active: boolean;
    created_at: string;
}

interface GroupEventCardProps {
    event: GroupEvent;
    totalSteps?: number;
    percentage?: number;
    topContributors?: MemberProgress[];
}

export default function GroupEventCard({
    event,
    totalSteps = 0,
    percentage = 0,
    topContributors = [],
}: GroupEventCardProps) {
    const t = useTranslations('GroupEvent');

    const now = new Date();
    const endDate = new Date(event.end_date + 'T23:59:59');
    const startDate = new Date(event.start_date);
    const isUpcoming = now < startDate;
    const isEnded = now > endDate;
    const daysLeft = isEnded
        ? 0
        : Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const formatSteps = (steps: number) => {
        if (steps >= 1_000_000) return `${(steps / 1_000_000).toFixed(1)}M`;
        if (steps >= 1_000) return `${(steps / 1_000).toFixed(0)}K`;
        return steps.toLocaleString();
    };

    return (
        <div className="bg-white midnight-solid-panel rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* ヘッダー */}
            <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 truncate">
                            {event.title}
                        </h3>
                        {event.description && (
                            <p className="text-sm text-[var(--foreground-muted)] mt-1 line-clamp-2">
                                {event.description}
                            </p>
                        )}
                    </div>

                    {/* 報酬バッジ */}
                    <div className="flex-shrink-0 flex items-center gap-1 bg-[var(--theme-primary-light)] text-[var(--theme-primary)] px-2.5 py-1 rounded-full text-xs font-bold border border-[var(--theme-primary)]/20">
                        <span>🪙</span>
                        <span>{event.reward_uc} UC</span>
                    </div>
                </div>

                {/* 日付 & 残り日数 */}
                <div className="flex items-center gap-3 mt-3 text-xs text-[var(--foreground-muted)]">
                    <span className="flex items-center gap-1">
                        📅 {formatDate(event.start_date)} – {formatDate(event.end_date)}
                    </span>
                    {isUpcoming ? (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
                            {t('upcoming')}
                        </span>
                    ) : isEnded ? (
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">
                            {t('ended')}
                        </span>
                    ) : (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] font-semibold">
                            {t('daysLeft', { count: daysLeft })}
                        </span>
                    )}
                </div>
            </div>

            {/* プログレスバー */}
            <div className="px-4 sm:px-5 pb-4 sm:pb-5">
                <div className="flex items-center justify-between text-xs font-medium mb-1.5">
                    <span className="text-[var(--foreground-muted)]">{t('teamProgress')}</span>
                    <span className="text-gray-900 font-bold">
                        {formatSteps(totalSteps)} / {formatSteps(event.target_steps)} ({percentage}%)
                    </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                            width: `${Math.min(percentage, 100)}%`,
                            background: percentage >= 100
                                ? 'linear-gradient(90deg, #10b981, #059669)'
                                : 'linear-gradient(90deg, var(--theme-gradient-from), var(--theme-gradient-to))',
                        }}
                    />
                </div>

                {/* トップ貢献者 */}
                {topContributors.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs font-semibold text-[var(--foreground-muted)] mb-2">
                            {t('topContributors')}
                        </p>
                        <div className="flex flex-col gap-1.5">
                            {topContributors.slice(0, 3).map((contributor, index) => (
                                <div key={contributor.user_id} className="flex items-center gap-2 text-xs">
                                    <span className="font-bold text-[var(--foreground-muted)] w-4">
                                        {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                                    </span>
                                    {contributor.image ? (
                                        <img
                                            src={contributor.image}
                                            alt={contributor.name}
                                            className="w-5 h-5 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-5 h-5 rounded-full bg-[var(--theme-primary-light)] text-[var(--theme-primary)] flex items-center justify-center text-[10px] font-bold">
                                            {(contributor.name || '?')[0].toUpperCase()}
                                        </div>
                                    )}
                                    <span className="text-gray-900 font-medium truncate flex-1">
                                        {contributor.name}
                                    </span>
                                    <span className="text-[var(--foreground-muted)] font-mono">
                                        {formatSteps(contributor.steps)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
