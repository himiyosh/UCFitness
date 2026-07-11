'use client';

import { useState, useEffect, useCallback } from 'react';

import { useTranslations } from 'next-intl';

import { Link } from '@/navigation';

import type { ReactNode } from 'react';

// ============================================
// ダッシュボード用チャレンジウィジェット
// アクティブなチャレンジを最大2件表示
// ============================================

interface ParticipantAvatar {
    username?: string;
    name?: string;
    image?: string;
}

interface DashboardChallenge {
    id: string;
    title: string;
    target_steps: number;
    start_date?: string;
    end_date: string;
    reward_uc: number;
    is_joined: boolean;
    participant_count: number;
    participant_avatars?: ParticipantAvatar[];
}

export default function DashboardChallenges(): ReactNode {
    const t = useTranslations('Challenge');
    const [challenges, setChallenges] = useState<DashboardChallenge[]>([]);
    const [progressMap, setProgressMap] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    // チャレンジを取得（retry にも使える useCallback 版）
    const fetchChallenges = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await fetch('/api/challenge?status=active');
            if (!res.ok) {
                setError(true);
                return;
            }
            const data = await res.json();
            const sliced = (data.challenges || []).slice(0, 2);
            setChallenges(sliced);

            // 参加済みチャレンジの歩数進捗を取得
            const joined = sliced.filter((c: DashboardChallenge) => c.is_joined);
            if (joined.length > 0) {
                const entries = await Promise.all(
                    joined.map(async (c: DashboardChallenge) => {
                        try {
                            const pRes = await fetch(`/api/challenge/${c.id}/progress`);
                            if (!pRes.ok) return [c.id, 0];
                            const pData = await pRes.json();
                            return [c.id, pData.progress?.total_steps || 0];
                        } catch {
                            return [c.id, 0];
                        }
                    })
                );
                setProgressMap(Object.fromEntries(entries));
            }
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchChallenges();
    }, [fetchChallenges]);

    if (loading) {
        return (
            <div aria-busy="true" className="rounded-xl border border-l-4 border-[var(--color-border)] border-l-[var(--color-competition)] bg-[var(--color-surface)] p-3 shadow-sm">
                <h2 className="sr-only">{t('activeChallenges')}</h2>
                <p className="sr-only" role="status" aria-atomic="true">{t('loading')}</p>
                <div className="animate-pulse">
                    <div className="mb-4 h-5 w-40 rounded bg-[var(--color-surface-muted)]" />
                    <div className="mb-2 h-16 rounded bg-[var(--color-surface-muted)]" />
                    <div className="h-16 rounded bg-[var(--color-surface-muted)]" />
                </div>
            </div>
        );
    }

    // エラーチェックを空チェックより先に行う（デフォルト空配列でエラーが隠れるバグ修正）
    if (error) {
        return (
            <div className="rounded-xl border border-l-4 border-[var(--color-border)] border-l-[var(--color-competition)] bg-[var(--color-surface)] p-3 shadow-sm">
                <div className="flex flex-col items-center py-6 text-center">
                    <StatusIcon />
                    <h2 className="mt-2 text-sm font-semibold text-[var(--color-text)]">{t('activeChallenges')}</h2>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]" role="alert">{t('loadError')}</p>
                    <button
                        onClick={fetchChallenges}
                        className="mt-3 min-h-[44px] rounded-lg bg-[var(--color-primary-solid)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-inverse-surface)]"
                    >
                        {t('retry') || '再試行'}
                    </button>
                </div>
            </div>
        );
    }

    if (challenges.length === 0) {
        return (
            <div className="rounded-xl border border-l-4 border-[var(--color-border)] border-l-[var(--color-competition)] bg-[var(--color-surface)] p-3 text-center shadow-sm">
                <h2 className="text-base font-bold text-[var(--color-text)]">{t('activeChallenges')}</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--color-text-muted)]" role="status">
                    {t('noActive')}
                </p>
                <Link
                    href="/challenges"
                    className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--color-primary-solid)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-inverse-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2"
                >
                    {t('viewAll')}
                </Link>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-l-4 border-[var(--color-border)] border-l-[var(--color-competition)] bg-[var(--color-surface)] p-3 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-[var(--color-text)]">
                    {t('activeChallenges')}
                </h2>
                <Link
                    href="/challenges"
                    className="inline-flex min-h-[44px] items-center text-xs font-semibold text-[var(--color-competition-strong)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)] focus-visible:ring-offset-2"
                >
                    {t('viewAll')}
                </Link>
            </div>

            <div className="space-y-2">
                {challenges.map(challenge => {
                    const endDate = new Date(challenge.end_date + 'T23:59:59');
                    const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                    const avatars = challenge.participant_avatars || [];
                    const currentSteps = progressMap[challenge.id] || 0;
                    const stepsPercent = Math.min(100, Math.round((currentSteps / challenge.target_steps) * 100));
                    const isCompleted = stepsPercent >= 100;

                    return (
                        <Link
                            key={challenge.id}
                            href="/challenges"
                            className="block rounded-lg border border-[var(--color-competition)]/30 bg-[var(--color-competition-soft)] p-2.5 transition-colors duration-200 hover:border-[var(--color-competition)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)] focus-visible:ring-offset-2"
                        >
                            <div className="flex-1 min-w-0">
                                <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                                    {formatChallengeTitle(challenge.title, challenge.target_steps, t)}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
                                    <span className="rounded-full bg-[var(--color-reward-soft)] px-2 py-0.5 font-semibold text-[var(--color-reward-strong)]">{t('reward')}: {challenge.reward_uc} UC</span>
                                    <span>{t('daysLeft', { count: daysLeft })}</span>
                                </div>
                            </div>

                            {/* 歩数プログレスバー */}
                            <div className="mt-2">
                                <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-[10px] text-[var(--color-text-muted)]">
                                        {currentSteps.toLocaleString()} / {challenge.target_steps.toLocaleString()} {t('stepsUnit')}
                                    </span>
                                    <span className={`text-[10px] font-bold ${isCompleted ? 'text-[var(--color-success-strong)]' : 'text-[var(--color-competition-strong)]'}`}>
                                        {stepsPercent}%
                                    </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                                    <div
                                        className={`h-full rounded-full transition-[width] duration-700 ${
                                            isCompleted
                                                ? 'bg-[var(--color-success)]'
                                                : 'bg-[var(--color-competition-solid)]'
                                        }`}
                                        style={{ width: `${stepsPercent}%` }}
                                    />
                                </div>
                            </div>

                            {/* 参加者アイコン */}
                            <div className="flex items-center mt-2">
                                {avatars.length > 0 && (
                                    <div className="flex -space-x-1.5">
                                        {avatars.slice(0, 4).map((avatar, idx) => (
                                            <div
                                                key={avatar.username || idx}
                                                className="h-5 w-5 shrink-0 overflow-hidden rounded-full border-[1.5px] border-[var(--color-surface)] bg-[var(--color-surface-muted)]"
                                                style={{ zIndex: avatars.length - idx }}
                                            >
                                                {avatar.image ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={avatar.image} alt={avatar.name || ''} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center bg-[var(--color-surface-muted)] text-[8px] font-bold text-[var(--color-text-muted)]">
                                                        {(avatar.name || avatar.username || '?')[0]?.toUpperCase()}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {challenge.participant_count > 4 && (
                                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--color-surface)] bg-[var(--color-surface-muted)] text-[8px] font-bold text-[var(--color-text-muted)]">
                                                +{challenge.participant_count - 4}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <span className="ml-1.5 text-[10px] text-[var(--color-text-muted)]">
                                    {challenge.participant_count}{t('participantUnit')}
                                </span>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

function stripLeadingEmoji(text: string): string {
    return text.replace(/^\p{Extended_Pictographic}[\uFE0F]?\s*/u, '');
}

function formatChallengeTitle(
    title: string,
    targetSteps: number,
    t: ReturnType<typeof useTranslations<'Challenge'>>
): string {
    const plainTitle = stripLeadingEmoji(title);
    const lowerTitle = plainTitle.toLowerCase();
    if (plainTitle.includes('ウィークリー') || lowerTitle.includes('weekly')) {
        return t('weeklyChallengeTitle', { steps: targetSteps.toLocaleString() });
    }
    return plainTitle;
}

function StatusIcon() {
    return (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-muted)] text-[var(--color-danger)]" aria-hidden="true">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
        </span>
    );
}
