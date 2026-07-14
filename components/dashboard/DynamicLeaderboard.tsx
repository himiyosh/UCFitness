'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';

import {
    buildRankingPeriodQuery,
    getDisplayRankings,
    getRankGapInsight,
    isRankingPeriod,
} from '@/lib/services/ranking-utils';
import { Link } from '@/navigation';
import GroupRankingPanel from '@/components/group/GroupRankingPanel';
import UserAvatar from '@/components/UserAvatar';
import { useTheme } from '@/components/ThemeProvider';
import { useTranslations } from 'next-intl';

import type { RankingEntry } from '@/lib/services/ranking-utils';
import type { Period } from '@/components/dashboard/LeaderboardTabs';

const TABS: { key: Period; labelKey: string; icon: string }[] = [
    { key: 'DAILY', labelKey: 'periods.daily', icon: '☀️' },
    { key: 'WEEKLY', labelKey: 'periods.weekly', icon: '📅' },
    { key: 'MONTHLY', labelKey: 'periods.monthly', icon: '📆' },
    { key: 'YEARLY', labelKey: 'periods.yearly', icon: '🏆' },
];
const MIN_ROWS = 5;

// ランクバッジの表示テキスト（1-3位はメダル絵文字）
function getRankDisplay(rank: number): { text: string; isMedal: boolean } {
    if (rank === 1) return { text: '🥇', isMedal: true };
    if (rank === 2) return { text: '🥈', isMedal: true };
    if (rank === 3) return { text: '🥉', isMedal: true };
    return { text: String(rank), isMedal: false };
}

interface DynamicLeaderboardProps {
    userId?: string | null;
    groupKeywords: string[];
    groupInfo?: { keyword: string; imageUrl: string | null }[];
}

/** スケルトン行コンポーネント（ローディング中表示用） */
function SkeletonRow({ index }: { index: number }): JSX.Element {
    return (
        <div
            className="px-3 py-3 sm:px-6 sm:py-4 flex items-center gap-3 rank-skeleton-row"
            style={{ animationDelay: `${index * 0.1}s` }}
        >
            <div className="w-7 h-7 rounded-full bg-gray-200 shrink-0" />
            <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
            <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-gray-200 rounded w-24" />
                <div className="h-2.5 bg-gray-100 rounded w-16" />
            </div>
            <div className="h-4 bg-gray-200 rounded w-14" />
        </div>
    );
}

export default function DynamicLeaderboard({ userId, groupKeywords, groupInfo }: DynamicLeaderboardProps) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();
    const requestedPeriod = searchParams.get('period');
    const period: Period = isRankingPeriod(requestedPeriod) ? requestedPeriod : 'WEEKLY';
    const { theme } = useTheme();
    const t = useTranslations('Leaderboard');
    const commonT = useTranslations('Common');
    const locale = useLocale();
    const [globalRankings, setGlobalRankings] = useState<RankingEntry[]>([]);
    const [groupRankingsList, setGroupRankingsList] = useState<{ keyword: string; neighbors: RankingEntry[] }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);
    const [retryKey, setRetryKey] = useState(0);
    const [activeGroupIndex, setActiveGroupIndex] = useState(0);
    // データ取得完了後にアニメーションを発火させるキー
    const [animationKey, setAnimationKey] = useState(0);
    const requestIdRef = useRef(0);
    const requestedPeriodRef = useRef<Period>(period);

    const isMidnight = theme === 'midnight';

    // 自分の順位を取得（ヒーローセクション用）
    const myEntry = useMemo(
        () => globalRankings.find(e => e.users?.id === userId) ?? null,
        [globalRankings, userId]
    );
    const myRankGapInsight = useMemo(
        () => getRankGapInsight(globalRankings, userId),
        [globalRankings, userId],
    );
    const activePeriodLabel = t(
        TABS.find(tab => tab.key === period)?.labelKey ?? 'periods.daily',
    );
    const rankingStatus = isLoading
        ? t('loadingRankings')
        : fetchError
            ? commonT('error')
            : t('rankingsUpdated', { period: activePeriodLabel });

    // 配列参照の安定化
    const serializedKeywords = JSON.stringify(groupKeywords);

    const handlePeriodChange = useCallback((newPeriod: Period) => {
        if (newPeriod === requestedPeriodRef.current) return;
        requestedPeriodRef.current = newPeriod;
        const query = buildRankingPeriodQuery(searchParams.toString(), newPeriod);
        router.replace(`${pathname}?${query}`, { scroll: false });
    }, [pathname, router, searchParams]);
    const handleRetry = useCallback(() => {
        setIsLoading(true);
        setFetchError(false);
        setRetryKey(current => current + 1);
    }, []);

    useEffect(() => {
        requestedPeriodRef.current = period;
    }, [period]);

    useEffect(() => {
        const abortController = new AbortController();
        const requestId = ++requestIdRef.current;
        const keywords: string[] = JSON.parse(serializedKeywords);
        const fetchData = async (): Promise<void> => {
            setIsLoading(true);
            setFetchError(false);
            setGlobalRankings([]);
            setGroupRankingsList([]);
            try {
                const globalRes = await fetch(`/api/rankings?scope=GLOBAL&period=${period}`, { signal: abortController.signal });
                if (!globalRes.ok) throw new Error(`Rankings fetch failed: ${globalRes.status}`);
                const globalData = await globalRes.json();
                const { displayRankings: filteredGlobal } = getDisplayRankings(globalData, userId, 5);

                const groupResults = await Promise.all(
                    keywords.map(async (keyword) => {
                        const res = await fetch(`/api/rankings?scope=GROUP&period=${period}&keyword=${keyword}`, { signal: abortController.signal });
                        if (!res.ok) throw new Error(`Group ranking fetch failed: ${res.status}`);
                        const data = await res.json();
                        const { displayRankings: filtered } = getDisplayRankings(data, userId, 5);
                        return { keyword, neighbors: filtered };
                    })
                );
                if (requestIdRef.current !== requestId) return;
                setGlobalRankings(filteredGlobal);
                setGroupRankingsList(groupResults);
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                if (requestIdRef.current !== requestId) return;
                setGlobalRankings([]);
                setGroupRankingsList([]);
                setFetchError(true);
            } finally {
                if (requestIdRef.current === requestId) {
                    setIsLoading(false);
                    setAnimationKey(k => k + 1);
                }
            }
        };

        fetchData();
        return () => {
            abortController.abort();
            if (requestIdRef.current === requestId) {
                requestIdRef.current += 1;
            }
        };
    }, [period, userId, serializedKeywords, retryKey]);

    return (
        <div className="flex flex-col gap-3">
            <p className="sr-only" role="status">{rankingStatus}</p>
            {/* ===== 共通コントロールバー: ピリオドタブ + グループタブ ===== */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                {/* ピリオドタブ */}
                <div
                    className={`flex p-1 gap-1 rounded-xl w-full sm:w-fit backdrop-blur-sm ${
                        !isMidnight ? 'bg-white/80 border border-gray-200/60 shadow-sm' : ''
                    }`}
                    style={isMidnight ? { backgroundColor: 'rgba(30, 41, 59, 0.85)', border: '1px solid rgba(100, 116, 139, 0.4)', backdropFilter: 'blur(8px)' } : undefined}
                    role="group"
                    aria-label={t('periodTabsLabel')}
                >
                    {TABS.map((tab) => {
                        const isActive = period === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => handlePeriodChange(tab.key)}
                                aria-pressed={isActive}
                                className={`ranking-filter-button flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-shadow duration-200 sm:flex-none sm:px-4 sm:text-sm ${
                                    !isMidnight
                                        ? (isActive
                                            ? 'bg-[var(--color-primary-solid)] text-white shadow-md shadow-[var(--color-primary)]/25'
                                            : 'text-[var(--color-text-muted)] hover:bg-gray-100/80 hover:text-[var(--color-text)]')
                                        : ''
                                }`}
                                style={isMidnight ? {
                                    backgroundColor: isActive ? 'var(--color-primary-solid)' : 'transparent',
                                    color: isActive ? '#ffffff' : 'var(--color-text-muted)',
                                    border: isActive ? '2px solid var(--color-text)' : '2px solid transparent',
                                    boxShadow: isActive ? '0 4px 12px rgba(99, 102, 241, 0.3)' : 'none',
                                } : undefined}
                            >
                                <span className="hidden text-sm sm:inline" aria-hidden="true">{tab.icon}</span>
                                <span>{t(tab.labelKey)}</span>
                                {isActive && <span aria-hidden="true">✓</span>}
                            </button>
                        );
                    })}
                </div>

                {/* グループ切替タブ（デスクトップ: 右寄せ） */}
                {groupRankingsList.length > 1 && (
                    <div
                        role="group"
                        aria-label={t('groupSelectorLabel')}
                        className={`flex flex-nowrap gap-1.5 p-1.5 overflow-x-auto scrollbar-hide rounded-xl backdrop-blur-sm ${
                            !isMidnight ? 'bg-white/80 border border-gray-100/60 shadow-sm' : ''
                        }`}
                        style={isMidnight ? { backgroundColor: 'rgba(30, 41, 59, 0.85)', border: '1px solid rgba(100, 116, 139, 0.4)' } : undefined}
                    >
                        {groupRankingsList.map((groupData, index) => {
                            const isActive = activeGroupIndex === index;
                            const shortName = groupData.keyword.replace(/^group:/, '').slice(0, 2).toUpperCase();
                            const info = groupInfo?.find(g => g.keyword === groupData.keyword);
                            const imageUrl = info?.imageUrl;
                            return (
                                <button
                                    key={groupData.keyword}
                                    onClick={() => setActiveGroupIndex(index)}
                                    aria-pressed={isActive}
                                    className={`ranking-filter-button flex min-h-[44px] flex-shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-shadow duration-200 sm:px-4 sm:py-2 sm:text-sm ${
                                        isActive
                                            ? (!isMidnight
                                                ? 'bg-[var(--color-primary-solid)] text-white shadow-md shadow-[var(--color-primary)]/25'
                                                : 'bg-[var(--color-primary-solid)] text-white ring-2 ring-inset ring-[var(--color-text)]')
                                            : (!isMidnight
                                                ? 'text-gray-500 hover:bg-gray-50/80 hover:text-gray-700'
                                                : 'text-gray-400 hover:text-white')
                                    }`}
                                >
                                    <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full overflow-hidden flex-shrink-0 ${
                                        isActive ? 'bg-white/20 ring-1 ring-white/30' : 'bg-black/5'
                                    } text-[10px]`}>
                                        {imageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            shortName
                                        )}
                                    </div>
                                    <span className="inline-block truncate max-w-[100px] sm:max-w-[140px]">{groupData.keyword.replace(/^group:/, '')}</span>
                                    {isActive && <span aria-hidden="true">✓</span>}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ===== 2カラムグリッド: カードのみ（タブは上に分離済み） ===== */}
            <div
                className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-stretch lg:gap-4"
                aria-busy={isLoading}
            >
                {/* グローバルランキング */}
                <div className="lg:col-span-5" data-ranking-panel="global">
                <div
                    key={animationKey}
                    className={`overflow-hidden rounded-xl shadow-sm min-h-[360px] tab-content-enter flex flex-col h-full ${
                        !isMidnight ? 'bg-white/90 backdrop-blur-sm border border-gray-100/80' : ''
                    }`}
                    style={isMidnight ? { background: 'rgba(30,41,59,0.7)', border: '1px solid rgba(100,116,139,0.3)', backdropFilter: 'blur(8px)' } : undefined}
                >
                    {/* カードヘッダー — グラデーション帯 */}
                    <div className={`px-4 py-3 sm:px-6 flex justify-between items-center ${
                        !isMidnight
                            ? 'bg-gradient-to-r from-[var(--theme-primary)]/5 to-transparent border-b border-gray-100/60'
                            : 'border-b border-slate-600/20'
                    }`}>
                        <div className="flex items-center gap-2">
                            <span className="text-lg">🌍</span>
                            <h3 className={`text-sm font-bold ${isMidnight ? 'text-slate-100' : 'text-gray-900'}`}>
                                {t('titleGlobal')}
                            </h3>
                        </div>
                        <span className={`py-1 px-2.5 rounded-full text-xs font-semibold ${
                            isMidnight
                                ? 'bg-slate-700/50 text-slate-300 border border-slate-600/30'
                                : 'bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] border border-[var(--theme-primary)]/15'
                        }`}>{t('topAndNeighbors')}</span>
                    </div>

                    {/* ランキングリスト — flex-1 で余剰高さを吸収 */}
                    <div className="relative flex-1">
                        {/* ローディング: スケルトン行 */}
                        {isLoading && (
                            <div className="divide-y divide-gray-50">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <SkeletonRow key={i} index={i} />
                                ))}
                            </div>
                        )}

                        {/* エラー */}
                        {!isLoading && fetchError && (
                            <div
                                className="flex flex-col items-center justify-center px-4 py-12 text-center"
                                data-ranking-state="global-error"
                            >
                                <span className="text-4xl mb-3">⚠️</span>
                                <p className={`text-sm font-medium mb-3 ${isMidnight ? 'text-slate-400' : 'text-gray-500'}`}>
                                    {commonT('error')}
                                </p>
                                <button
                                    onClick={handleRetry}
                                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                                >
                                    {commonT('retry')}
                                </button>
                            </div>
                        )}

                        {/* データなし */}
                        {!isLoading && !fetchError && globalRankings.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                <span className="text-4xl mb-3">🏃</span>
                                <p className={`text-sm font-medium ${isMidnight ? 'text-slate-400' : 'text-gray-500'}`}>
                                    {t('noData')}
                                </p>
                                <p className={`text-xs mt-1 ${isMidnight ? 'text-slate-500' : 'text-gray-400'}`}>
                                    {t('emptyMotivation')}
                                </p>
                            </div>
                        )}

                        {/* ランキング行 */}
                        {!isLoading && !fetchError && (
                            <ul role="list" className={`divide-y ${isMidnight ? 'divide-slate-600/15' : 'divide-gray-50'}`}>
                                {globalRankings.map((entry, index) => {
                                    const isGap = index > 0 && entry.originalRank > globalRankings[index - 1].originalRank + 1;
                                    const isMe = entry.users.id === userId;
                                    const rank = entry.originalRank;
                                    const rankDisplay = getRankDisplay(rank);
                                    const isTop3 = rank <= 3;

                                    return (
                                        <Fragment key={entry.originalRank}>
                                            {isGap && (
                                                <li aria-hidden="true" className={`px-6 py-1.5 flex justify-center ${
                                                    isMidnight ? 'bg-slate-800/30' : 'bg-gray-50/80'
                                                }`}>
                                                    <span className={`text-xs tracking-[0.3em] ${isMidnight ? 'text-slate-600' : 'text-gray-300'}`}>
                                                        ···
                                                    </span>
                                                </li>
                                            )}
                                            <li
                                                className={`
                                                    leaderboard-row relative min-h-[4.5rem] flex flex-col justify-center
                                                    px-3 py-2 sm:px-6 sm:py-2.5
                                                    transition-colors overflow-visible
                                                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)]
                                                    rank-row-enter
                                                    ${rank === 1 ? 'rank-row-1 rank-row-1-shimmer' : ''}
                                                    ${rank === 2 ? 'rank-row-2' : ''}
                                                    ${rank === 3 ? 'rank-row-3' : ''}
                                                    ${isMe ? 'my-row-accent' : ''}
                                                    ${entry.users.username ? 'cursor-pointer' : ''}
                                                `}
                                                style={{ animationDelay: `${index * 0.06}s` }}
                                            >
                                                {entry.users.username && (
                                                    <Link
                                                        href={`/user/${entry.users.username}`}
                                                        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-competition)]"
                                                    >
                                                        <span className="sr-only">{entry.users.name || commonT('anonymous')}</span>
                                                    </Link>
                                                )}
                                                <div className="pointer-events-none relative z-10 flex items-center justify-between">
                                                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                                        {/* ランクバッジ */}
                                                        <span
                                                            className={`
                                                                flex items-center justify-center shrink-0 rounded-full font-bold
                                                                ${rankDisplay.isMedal
                                                                    ? 'w-8 h-8 text-lg'
                                                                    : 'w-7 h-7 text-xs'
                                                                }
                                                                ${rank === 1 ? 'rank-badge-glow' : ''}
                                                                ${!rankDisplay.isMedal ? (isMidnight ? 'bg-slate-700/50 text-slate-400' : 'bg-gray-100 text-gray-400') : ''}
                                                            `}
                                                        >
                                                            {rankDisplay.text}
                                                        </span>

                                                        <UserAvatar
                                                            src={entry.users?.image}
                                                            name={entry.users?.name || '?'}
                                                            size="sm"
                                                            frameColor={entry.users?.frameColor}
                                                            borderClass={isMe ? 'ring-2 ring-[var(--theme-primary)] ring-offset-2' : 'border-gray-100'}
                                                        />

                                                        <div className="min-w-0 flex-1">
                                                            <p className={`text-sm truncate flex items-center gap-1.5 ${
                                                                isMe ? 'font-bold' : 'font-semibold'
                                                            } ${
                                                                isMidnight ? 'text-slate-100' : 'text-gray-900'
                                                            }`}>
                                                                <span className="truncate">
                                                                    {entry.users?.name || commonT('anonymous')}
                                                                </span>
                                                                {isMe && (
                                                                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] bg-[var(--theme-primary)] text-white font-bold leading-none shadow-sm shadow-[var(--theme-primary)]/30">
                                                                        {commonT('you')}
                                                                    </span>
                                                                )}
                                                            </p>
                                                            {entry.users?.titleEmoji && (entry.users?.titleNameJa || entry.users?.titleNameEn) && (
                                                                <span className={`text-xs font-medium whitespace-nowrap leading-tight ${
                                                                    isMidnight ? 'text-slate-400' : 'text-gray-400'
                                                                }`}>
                                                                    {entry.users.titleEmoji} {locale === 'ja' ? entry.users.titleNameJa : entry.users.titleNameEn}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {/* 歩数 */}
                                                    <div className="flex flex-col items-end shrink-0 steps-reveal" style={{ animationDelay: `${index * 0.06 + 0.15}s` }}>
                                                        <div className={`tabular-nums font-black text-base sm:text-lg leaderboard-steps ${
                                                            isTop3 && !isMidnight ? 'text-[var(--theme-primary)]' : ''
                                                        }`}>
                                                            {entry.steps.toLocaleString()}
                                                        </div>
                                                        {entry.prevSteps !== undefined && (() => {
                                                            const delta = entry.steps - entry.prevSteps!;
                                                            if (delta === 0) return null;
                                                            return (
                                                                <span className={`text-xs font-bold tabular-nums leading-tight delta-animated ${delta > 0 ? 'delta-up' : 'delta-down'}`}>
                                                                    {delta > 0 ? '▲' : '▼'}{Math.abs(delta).toLocaleString()}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            </li>
                                        </Fragment>
                                    );
                                })}
                                {Array.from({ length: Math.max(0, MIN_ROWS - globalRankings.length) }, (_, index) => (
                                    <li
                                        key={`global-empty-${index}`}
                                        className="leaderboard-row flex min-h-[4.5rem] flex-col justify-center px-3 py-2 sm:px-6 sm:py-2.5"
                                        aria-hidden="true"
                                    />
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* 自分のランク — カード下部のミニサマリー（mt-auto で常に下端に固定） */}
                    {!isLoading && myEntry && (
                        <div className={`mt-auto flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${
                            isMidnight
                                ? 'bg-slate-800/40 border-t border-slate-600/20'
                                : 'bg-gradient-to-r from-[var(--theme-primary)]/5 to-[var(--theme-primary)]/2 border-t border-[var(--theme-primary)]/10'
                        }`}>
                            <div className="flex items-center gap-2">
                                <span className="text-sm" aria-hidden="true">📍</span>
                                <span className={`text-xs font-semibold ${isMidnight ? 'text-slate-300' : 'text-gray-600'}`}>
                                    {t('yourRank')}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                <span className={`text-sm font-bold ${isMidnight ? 'text-indigo-300' : 'text-[var(--theme-primary)]'}`}>
                                    #{myEntry.originalRank}
                                </span>
                                <span className={`text-sm font-bold tabular-nums ${isMidnight ? 'text-slate-200' : 'text-gray-800'}`}>
                                    {myEntry.steps.toLocaleString()} {t('steps')}
                                </span>
                                {myRankGapInsight && (
                                    <span
                                        data-rank-gap="global"
                                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                                            myRankGapInsight.isTopRank
                                                ? 'bg-[var(--color-success-soft)] text-[var(--color-success-strong)]'
                                                : 'bg-[var(--color-competition-soft)] text-[var(--color-competition-strong)]'
                                        }`}
                                    >
                                        {myRankGapInsight.isTopRank
                                            ? t('topRankStatus')
                                            : t('nextRankGap', {
                                                steps: myRankGapInsight.stepsToNextRank?.toLocaleString() ?? '—',
                                                rank: myRankGapInsight.targetRank ?? 1,
                                            })}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ===== グループランキング ===== */}
            <div className="lg:col-span-7" data-ranking-panel="group">

                {!isLoading && fetchError ? (
                    <div
                        className={`flex min-h-[360px] flex-col overflow-hidden rounded-xl border text-center ${
                            isMidnight
                                ? 'border-slate-600/30 bg-slate-800/40'
                                : 'border-gray-100 bg-white/90'
                        }`}
                        data-ranking-state="group-error"
                    >
                        <div className={`flex items-center gap-2 px-4 py-3 text-left sm:px-6 ${
                            isMidnight ? 'border-b border-slate-600/20' : 'border-b border-gray-100/60'
                        }`}>
                            <span className="text-lg" aria-hidden="true">👥</span>
                            <h3 className={`text-sm font-bold ${isMidnight ? 'text-slate-100' : 'text-gray-900'}`}>
                                {t('titleGroup')}
                            </h3>
                        </div>
                        <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
                            <span className="mb-3 text-4xl" aria-hidden="true">⚠️</span>
                            <p className={`mb-3 text-sm font-medium ${isMidnight ? 'text-slate-400' : 'text-gray-500'}`}>
                                {commonT('error')}
                            </p>
                            <button
                                onClick={handleRetry}
                                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                            >
                                {commonT('retry')}
                            </button>
                        </div>
                    </div>
                ) : groupRankingsList.length > 0 ? (
                    <div className="h-full">
                        {/* 選択中のグループ */}
                        {groupRankingsList[activeGroupIndex] && (
                            <div className="relative leaderboard-card-enter h-full" key={`${activeGroupIndex}-${animationKey}`}>
                                <GroupRankingPanel
                                    keyword={groupRankingsList[activeGroupIndex].keyword}
                                    neighbors={groupRankingsList[activeGroupIndex].neighbors}
                                    userId={userId}
                                    index={activeGroupIndex}
                                    totalCount={groupRankingsList.length}
                                    period={period}
                                    showMoveButtons={false}
                                />
                                {isLoading && (
                                    <div className={`absolute inset-0 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl ${
                                        isMidnight ? 'bg-slate-900/40' : 'bg-white/60'
                                    }`}>
                                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--theme-primary)] border-t-transparent" />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    !isLoading && (
                        <div
                            className={`rounded-xl border-2 border-dashed p-8 text-center ${
                            isMidnight ? 'border-slate-600 text-slate-400' : 'border-gray-200 text-gray-500'
                            }`}
                            data-ranking-state="group-empty"
                        >
                            <span className="text-3xl block mb-3">👥</span>
                            <p className="font-medium">{t('joinPrompt')}</p>
                            <p className={`text-xs mt-1 ${isMidnight ? 'text-slate-500' : 'text-gray-400'}`}>
                                {t('joinPromptSub')}
                            </p>
                        </div>
                    )
                )}

            </div>
            </div>
        </div>
    );
}
