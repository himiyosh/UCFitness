'use client';

import { useState, useEffect } from 'react';
import { Period } from '@/components/dashboard/LeaderboardTabs';
import { getDisplayRankings, RankingEntry } from '@/lib/services/ranking-utils';
import GroupRankingPanel from '@/components/group/GroupRankingPanel';
import UserAvatar from '@/components/UserAvatar';
import { useTheme } from '@/components/ThemeProvider';
import { useTranslations } from 'next-intl';

// Helper to tabs
const TABS: { key: Period; labelKey: string }[] = [
    { key: 'DAILY', labelKey: 'periods.daily' },
    { key: 'WEEKLY', labelKey: 'periods.weekly' },
    { key: 'MONTHLY', labelKey: 'periods.monthly' },
    { key: 'YEARLY', labelKey: 'periods.yearly' },
];

interface DynamicLeaderboardProps {
    userId?: string | null;
    groupKeywords: string[];
    groupInfo?: { keyword: string; imageUrl: string | null }[];
}

export default function DynamicLeaderboard({ userId, groupKeywords, groupInfo }: DynamicLeaderboardProps) {
    const [period, setPeriod] = useState<Period>('DAILY');
    const { theme } = useTheme();
    const t = useTranslations('Leaderboard');
    const commonT = useTranslations('Common');
    const [globalRankings, setGlobalRankings] = useState<RankingEntry[]>([]);
    const [groupRankingsList, setGroupRankingsList] = useState<{ keyword: string; neighbors: RankingEntry[] }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeGroupIndex, setActiveGroupIndex] = useState(0);

    // 配列参照の安定化（親が毎レンダー新配列を渡してもeffectが再実行されない）
    const serializedKeywords = JSON.stringify(groupKeywords);

    useEffect(() => {
        const keywords: string[] = JSON.parse(serializedKeywords);
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch Global
                const globalRes = await fetch(`/api/rankings?scope=GLOBAL&period=${period}`);
                const globalData = await globalRes.json();
                const { displayRankings: filteredGlobal } = getDisplayRankings(globalData, userId);
                setGlobalRankings(filteredGlobal);

                // Fetch Groups
                const groupResults = await Promise.all(
                    keywords.map(async (keyword) => {
                        const res = await fetch(`/api/rankings?scope=GROUP&period=${period}&keyword=${keyword}`);
                        const data = await res.json();
                        const { displayRankings: filtered } = getDisplayRankings(data, userId);
                        return { keyword, neighbors: filtered };
                    })
                );
                setGroupRankingsList(groupResults);
            } catch {
                // エラーはUIにローディング解除で反映
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [period, userId, serializedKeywords]);

    return (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-4 lg:items-start">
            {/* Global Leaderboard (Mobile: Order 2, Desktop: Left 5 cols) */}
            <div className="lg:col-span-5 order-2 lg:order-1 flex flex-col gap-4">

                {/* TABS - Using inline styles for guaranteed dark theme */}
                <div
                    className={`flex p-1 space-x-1 rounded-lg w-fit ${theme !== 'midnight' ? 'bg-white border border-gray-200' : ''}`}
                    style={theme === 'midnight' ? { backgroundColor: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(100, 116, 139, 0.5)' } : undefined}
                    role="tablist"
                    aria-label="Leaderboard period"
                >
                    {TABS.map((tab) => {
                        const isActive = period === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setPeriod(tab.key)}
                                role="tab"
                                aria-selected={isActive}
                                className={`px-4 py-2 text-sm font-semibold rounded-md transition-all cursor-pointer ${theme !== 'midnight' ? (isActive ? 'bg-[var(--theme-primary)] text-white shadow-md' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100') : ''}`}
                                style={theme === 'midnight' ? {
                                    backgroundColor: isActive ? 'var(--theme-primary)' : 'transparent',
                                    color: '#ffffff',
                                    textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                                } : undefined}
                            >
                                {t(tab.labelKey)}
                            </button>
                        );
                    })}
                </div>

                <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100 min-h-[360px]">
                    <div className="px-4 py-3 sm:px-6 sm:py-5 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="text-base font-bold text-gray-900">
                            {t('titleGlobal')}
                        </h3>
                        <span className="bg-gray-100 text-gray-600 py-1 px-2 rounded text-xs font-semibold">{t('topAndNeighbors')}</span>
                    </div>

                    <div className="bg-white px-0 relative">
                        {isLoading && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--theme-primary)]"></div>
                            </div>
                        )}

                        <ul role="list" className="divide-y divide-gray-50">
                            {globalRankings.length === 0 && !isLoading ? (
                                <p className="text-gray-500 text-center py-8">{t('noData')}</p>
                            ) : (
                                globalRankings.map((entry, index) => {
                                    const isGap = index > 0 && entry.originalRank > globalRankings[index - 1].originalRank + 1;

                                    return (
                                        <div key={entry.originalRank}>
                                            {isGap && (
                                                <div className="px-6 py-2 bg-gray-50 flex justify-center border-b border-gray-50">
                                                    <span className="text-gray-400 text-xs tracking-widest">•••</span>
                                                </div>
                                            )}
                                            <li className={`relative px-3 py-2.5 sm:px-6 sm:py-4 flex items-center justify-between hover:bg-gray-50 transition-colors ${entry.users.username ? 'cursor-pointer' : ''} ${entry.users.id === userId ? 'bg-[var(--theme-primary-light)]' : ''}`}
                                                onClick={() => { if (entry.users.username) window.location.href = `/user/${entry.users.username}`; }}
                                            >
                                                <div className="flex items-center gap-2 sm:gap-4">
                                                    <span className={`
                                        flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-bold
                                        ${entry.originalRank === 1 ? 'bg-yellow-100 text-yellow-700' :
                                                            entry.originalRank === 2 ? 'bg-gray-100 text-gray-700' :
                                                                entry.originalRank === 3 ? 'bg-orange-100 text-orange-800' : 'text-gray-400'}
                                    `}>
                                                        {entry.originalRank}
                                                    </span>
                                                    <UserAvatar src={entry.users?.image} name={entry.users?.name || '?'} size="sm" frameColor={entry.users?.frameColor} borderClass="border-gray-100" />
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">
                                                            {entry.users?.name || commonT('anonymous')}
                                                            {entry.users.id === userId && <span className="ml-2 text-xs text-[var(--theme-primary)] font-bold">({commonT('you')})</span>}
                                                        </p>
                                                        {entry.users?.titleEmoji && (entry.users?.titleNameJa || entry.users?.titleNameEn) && (
                                                            <span className="text-xs text-gray-400 font-medium truncate">{entry.users.titleEmoji} {entry.users.titleNameEn}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <div className="font-mono font-semibold text-[var(--theme-primary)] text-base sm:text-lg leaderboard-steps">
                                                        {entry.steps.toLocaleString()}
                                                    </div>
                                                    {entry.prevSteps !== undefined && (() => {
                                                        const delta = entry.steps - entry.prevSteps!;
                                                        if (delta === 0) return null;
                                                        return (
                                                            <span className={`text-xs font-bold tabular-nums leading-tight ${delta > 0 ? 'delta-up' : 'delta-down'}`}>
                                                                {delta > 0 ? '▲' : '▼'}{Math.abs(delta).toLocaleString()}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </li>
                                        </div>
                                    );
                                })
                            )}
                        </ul>
                    </div>
                </div>
            </div>

            {/* Right Column Stack (Mobile: Order 1, Desktop: Right 7 cols) */}
            <div className="lg:col-span-7 order-1 lg:order-2 space-y-4 pb-2">

                {/* Group Leaderboards */}
                {groupRankingsList.length > 0 ? (
                    <div className="flex flex-col gap-4">
                        {/* チーム切り替え用アイコン・ボタン群 */}
                        {groupRankingsList.length > 1 && (
                            <div className={`flex flex-nowrap gap-2 p-1.5 overflow-x-auto scrollbar-hide rounded-xl ${theme !== 'midnight' ? 'bg-white border border-gray-100 shadow-sm' : ''}`} style={theme === 'midnight' ? { backgroundColor: 'rgba(30, 41, 59, 0.95)', border: '1px solid rgba(100, 116, 139, 0.5)' } : undefined}>
                                {groupRankingsList.map((groupData, index) => {
                                    const isActive = activeGroupIndex === index;
                                    const shortName = groupData.keyword.replace(/^group:/, '').slice(0, 2).toUpperCase();
                                    const info = groupInfo?.find(g => g.keyword === groupData.keyword);
                                    const imageUrl = info?.imageUrl;
                                    return (
                                        <button
                                            key={groupData.keyword}
                                            onClick={() => setActiveGroupIndex(index)}
                                            className={`flex-shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${
                                                isActive 
                                                    ? (theme !== 'midnight' ? 'bg-[var(--theme-primary)] text-white shadow-md' : 'bg-[var(--theme-primary)] text-white')
                                                    : (theme !== 'midnight' ? 'text-gray-600 hover:bg-gray-50' : 'text-gray-400 hover:text-white')
                                            }`}
                                        >
                                            <div className={`flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full overflow-hidden flex-shrink-0 ${isActive ? 'bg-white/20' : 'bg-black/5'} text-[10px]`}>
                                                {imageUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    shortName
                                                )}
                                            </div>
                                            <span className="inline-block truncate max-w-[100px] sm:max-w-[140px]">{groupData.keyword.replace(/^group:/, '')}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        
                        {/* 選択中のグループのみ表示 */}
                        {groupRankingsList[activeGroupIndex] && (
                            <div className="relative">
                                <GroupRankingPanel
                                    keyword={groupRankingsList[activeGroupIndex].keyword}
                                    neighbors={groupRankingsList[activeGroupIndex].neighbors}
                                    userId={userId}
                                    index={activeGroupIndex}
                                    totalCount={groupRankingsList.length}
                                />
                                {isLoading && (
                                    <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
                                        {/* Spinner optional here */}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    !isLoading && (
                        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-500">
                            {t('joinPrompt')}
                        </div>
                    )
                )}

            </div>
        </div>
    );
}

