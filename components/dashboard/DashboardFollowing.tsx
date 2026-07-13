'use client';

import { useCallback, useEffect, useState } from 'react';

import { useTranslations } from 'next-intl';

import { Link } from '@/navigation';

import UserAvatar from '@/components/UserAvatar';

// ============================================
// DashboardFollowing — ダッシュボード用フォロー中ユーザーカード
// 最近フォローした5人のアクティビティをコンパクトに表示
// ============================================

const DAILY_STEP_REFERENCE = 10_000;

interface FollowingUser {
    id: string;
    name: string | null;
    image: string | null;
    username: string | null;
    todaySteps: number;
    hasTodaySteps: boolean;
    followedAt: string;
}

interface FollowingResponse {
    following?: FollowingUser[];
    count?: number;
}

export default function DashboardFollowing() {
    const t = useTranslations('Follow');
    const [following, setFollowing] = useState<FollowingUser[]>([]);
    const [followingCount, setFollowingCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [hasData, setHasData] = useState(false);
    const [error, setError] = useState(false);

    // フォロー中ユーザーを取得（retry にも使える useCallback 版）
    const fetchFollowing = useCallback(async () => {
        setIsLoading(true);
        setError(false);
        try {
            const res = await fetch('/api/user/following?limit=5&sort=recent');
            if (res.ok) {
                const data: FollowingResponse = await res.json();
                const list = Array.isArray(data.following) ? data.following : [];
                setFollowing(list);
                setFollowingCount(typeof data.count === 'number' ? data.count : list.length);
                setHasData(list.length > 0);
            } else {
                setError(true);
            }
        } catch {
            setError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFollowing();
    }, [fetchFollowing]);

    // ローディング中はスケルトン表示
    if (isLoading) {
        return (
            <section className="rounded-2xl border border-[var(--color-primary)]/25 bg-[var(--color-surface)] p-3 shadow-sm sm:p-4" aria-busy="true" aria-labelledby="friend-pulse-loading-title">
                <div className="mb-3">
                    <h2 id="friend-pulse-loading-title" className="text-sm font-bold text-[var(--color-text)] sm:text-base">{t('followingActivity')}</h2>
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]" role="status">{t('loadingActivity')}</p>
                </div>
                <div className="space-y-2" aria-hidden="true">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex min-h-[58px] animate-pulse items-center gap-3 rounded-xl bg-[var(--color-surface-muted)] px-2.5 py-2">
                            <div className="h-8 w-8 rounded-full bg-[var(--color-border)]" />
                            <div className="h-3 flex-1 rounded bg-[var(--color-border)]" />
                            <div className="h-3 w-14 rounded bg-[var(--color-border)]" />
                        </div>
                    ))}
                </div>
            </section>
        );
    }

    // フォロー0件の場合は次の行動を示す
    if (!hasData && !error) {
        return (
            <section className="relative overflow-hidden rounded-2xl border border-[var(--color-primary)]/25 bg-[var(--color-surface)] p-3 shadow-sm sm:p-4" aria-labelledby="friend-pulse-empty-title">
                <div className="pointer-events-none absolute -bottom-12 -right-8 h-32 w-32 rounded-full bg-[var(--color-primary-soft)]" aria-hidden="true" />
                <div className="relative flex min-h-[190px] flex-col justify-between">
                    <div>
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" aria-hidden="true">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 0 2 2 4-4" />
                            </svg>
                        </span>
                        <h2 id="friend-pulse-empty-title" className="mt-3 text-base font-bold text-[var(--color-text)]">{t('followingActivity')}</h2>
                        <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{t('noFollowing')}</p>
                        <ol className="mt-3 hidden gap-2 xl:grid">
                            {[t('discoverStepRanking'), t('discoverStepProfile'), t('discoverStepPulse')].map(step => (
                                <li key={step} className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--color-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--color-text)]">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] font-black text-[var(--color-primary-strong)]" aria-hidden="true">
                                        →
                                    </span>
                                    {step}
                                </li>
                            ))}
                        </ol>
                    </div>
                    <Link href="/leaderboard" className="uc-interactive-panel mt-4 inline-flex min-h-[44px] w-fit items-center gap-1 rounded-xl bg-[var(--color-primary-solid)] px-4 py-2 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2">
                        {t('discoverPeople')}<span aria-hidden="true">→</span>
                    </Link>
                </div>
            </section>
        );
    }

    if (error) {
        return (
            <section className="rounded-2xl border border-[var(--color-danger)]/30 bg-[var(--color-surface)] p-3 shadow-sm sm:p-4" aria-labelledby="friend-pulse-error-title" role="alert">
                <div className="flex min-h-[190px] flex-col items-center justify-center text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-surface-muted)] text-[var(--color-danger)]" aria-hidden="true">!</span>
                    <h2 id="friend-pulse-error-title" className="mt-3 text-sm font-bold text-[var(--color-text)]">{t('followingActivity')}</h2>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t('loadError')}</p>
                    <button
                        onClick={fetchFollowing}
                        className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--color-primary-solid)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                    >
                        {t('retry')}
                    </button>
                </div>
            </section>
        );
    }

    return (
        <section className="relative overflow-hidden rounded-2xl border border-[var(--color-primary)]/25 bg-[var(--color-surface)] p-3 shadow-sm sm:p-4" aria-labelledby="friend-pulse-title">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[var(--color-primary-soft)]" aria-hidden="true" />
            <div className="relative">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-solid)] text-white" aria-hidden="true">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        </span>
                        <div className="min-w-0">
                            <h2 id="friend-pulse-title" className="text-sm font-bold text-[var(--color-text)] sm:text-base">{t('followingActivity')}</h2>
                            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{t('friendPulseSubtitle')}</p>
                        </div>
                    </div>
                    <span className="w-fit shrink-0 whitespace-nowrap rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary-strong)]">
                        {t('followCount', { count: followingCount })}
                    </span>
                </div>

                <ul className="mt-3 space-y-2">
                    {following.map(user => {
                    const displayName = user.name?.trim() || user.username?.trim() || t('unknownUser');
                    const hasTodaySteps = user.hasTodaySteps !== false;
                    const progressWidth = hasTodaySteps
                        ? Math.min(100, Math.round((user.todaySteps / DAILY_STEP_REFERENCE) * 100))
                        : 0;
                    const rowClassName = "relative flex min-h-[58px] items-center gap-3 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2";
                    const rowContent = (
                        <>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" aria-hidden="true">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
                                    <path d="M3 12h4l2-5 4 10 2-5h6" />
                                </svg>
                            </span>

                            <UserAvatar
                                src={user.image}
                                name={displayName}
                                size="sm"
                            />

                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-[var(--color-text)]">
                                    {displayName}
                                </span>
                                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]" aria-hidden="true">
                                    <span
                                        className="block h-full rounded-full bg-[var(--color-primary-solid)] transition-[width] duration-500"
                                        style={{ width: `${progressWidth}%` }}
                                    />
                                </span>
                            </span>

                            <span className="shrink-0 text-right">
                                <span className="block text-sm font-black tabular-nums text-[var(--color-primary-strong)]">
                                    {hasTodaySteps ? user.todaySteps.toLocaleString() : t('stepsNotRecorded')}
                                </span>
                                <span className="block text-xs text-[var(--color-text-muted)]">{t('todaySteps')}</span>
                            </span>
                        </>
                    );

                    return (
                    <li key={user.id}>
                        {user.username ? (
                            <Link
                                href={`/user/${user.username}`}
                                className={`uc-interactive-panel group ${rowClassName} active:bg-[var(--color-primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]`}
                            >
                                {rowContent}
                                <span className="sr-only">{t('profileLinkLabel', { name: displayName })}</span>
                                <span className="text-[var(--color-primary-strong)] transition-transform group-hover:translate-x-0.5" aria-hidden="true">›</span>
                            </Link>
                        ) : (
                            <div className={`pointer-events-none ${rowClassName}`}>
                                {rowContent}
                            </div>
                        )}
                    </li>
                    );
                    })}
                </ul>
                {following.length < 5 && (
                    <div className="mt-3 flex flex-col gap-2 rounded-xl bg-[var(--color-primary-soft)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-[var(--color-primary-strong)]">{t('sparseActivityHint')}</p>
                        <Link
                            href="/leaderboard"
                            className="inline-flex min-h-[44px] w-fit shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[var(--color-primary-strong)] active:bg-[var(--color-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                        >
                            {t('discoverMore')}<span aria-hidden="true">→</span>
                        </Link>
                    </div>
                )}
            </div>
        </section>
    );
}
