'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

// デフォルトのクイックリアクション絵文字
const DEFAULT_EMOJIS = ['👏', '🔥', '💪', '👍'] as const;

// 拡張絵文字カテゴリ
const EXTENDED_EMOJI_CATEGORIES = [
    { label: '😊', emojis: ['😊', '😂', '🤣', '😍', '🥳', '😎', '🤩', '🥺'] },
    { label: '👍', emojis: ['👏', '🔥', '💪', '👍', '🙌', '✌️', '🤝', '🫡'] },
    { label: '❤️', emojis: ['❤️', '💯', '⭐', '🏆', '🎉', '🎊', '💎', '👑'] },
    { label: '🏃', emojis: ['🏃', '🚀', '⚡', '💨', '🏅', '🥇', '🥈', '🥉'] },
] as const;

export interface Reaction {
    id: string;
    from_user_id: string;
    to_user_id: string;
    emoji: string;
    period: string;
}

interface GroupReactionsProps {
    groupId: string;
    toUserId: string;
    currentUserId: string;
    period: string;
    reactions: Reaction[];
    onReactionToggle: (toUserId: string, emoji: string, isAdding: boolean) => void;
    /** 自分自身の行かどうか */
    isSelf: boolean;
    /** コンパクト表示（リーダーボード行内用） */
    compact?: boolean;
    /** モバイル長押し等で強制表示（ピッカーも自動オープン） */
    forceShow?: boolean;
    /** compact時に表示するバッジの最大数（デフォルト3） */
    maxVisibleBadges?: number;
    /** ピッカー表示位置（デフォルト: above） */
    pickerPosition?: 'above' | 'below';
}

/**
 * グループメンバーへの絵文字リアクションボタン
 * リーダーボード各行にインラインで表示
 * ホバーでリアクション候補を表示、拡張ピッカーで全絵文字を選択可能
 */
export default function GroupReactions({
    toUserId,
    currentUserId,
    reactions,
    onReactionToggle,
    isSelf,
    compact = false,
    forceShow = false,
    maxVisibleBadges = 3,
    pickerPosition = 'above',
}: GroupReactionsProps) {
    const t = useTranslations('GroupReactions');
    const [loading, setLoading] = useState<string | null>(null);
    const [showPicker, setShowPicker] = useState(false);
    const [showExtended, setShowExtended] = useState(false);
    const [activeCategory, setActiveCategory] = useState(0);
    const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pickerRef = useRef<HTMLDivElement>(null);

    // このユーザーに対するリアクション集計（任意の絵文字に対応）
    const reactionCounts = useMemo(() => {
        const counts: Record<string, { count: number; reacted: boolean }> = {};
        const userReactions = reactions.filter(r => r.to_user_id === toUserId);
        for (const r of userReactions) {
            if (!counts[r.emoji]) {
                counts[r.emoji] = { count: 0, reacted: false };
            }
            counts[r.emoji].count++;
            if (r.from_user_id === currentUserId) {
                counts[r.emoji].reacted = true;
            }
        }
        return counts;
    }, [reactions, toUserId, currentUserId]);

    // リアクションがある絵文字リスト
    const activeEmojis = useMemo(() =>
        Object.keys(reactionCounts).filter(e => reactionCounts[e].count > 0),
        [reactionCounts]
    );

    const hasAnyReactions = activeEmojis.length > 0;

    const handleToggle = useCallback(async (emoji: string) => {
        if (loading) return;
        const isAdding = !reactionCounts[emoji]?.reacted;
        setLoading(emoji);
        try {
            onReactionToggle(toUserId, emoji, isAdding);
        } finally {
            setLoading(null);
        }
    }, [loading, reactionCounts, onReactionToggle, toUserId]);

    // ホバー制御（遅延付きで消える）
    const handleMouseEnter = useCallback(() => {
        if (hideTimeout.current) {
            clearTimeout(hideTimeout.current);
            hideTimeout.current = null;
        }
        setShowPicker(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
        hideTimeout.current = setTimeout(() => {
            setShowPicker(false);
            setShowExtended(false);
        }, 250);
    }, []);

    // 拡張ピッカーの外側クリックで閉じる
    useEffect(() => {
        if (!showExtended) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowExtended(false);
                setShowPicker(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showExtended]);

    // forceShow に連動してピッカーの開閉を制御
    // forceShow が false になったら即座に閉じる（複数ピッカー同時表示を防止）
    useEffect(() => {
        if (forceShow) {
            if (hideTimeout.current) {
                clearTimeout(hideTimeout.current);
                hideTimeout.current = null;
            }
            setShowPicker(true);
        } else {
            // 即座にクローズ — 他の行に移動した際に前の行のピッカーが残らないようにする
            setShowPicker(false);
            setShowExtended(false);
            if (hideTimeout.current) {
                clearTimeout(hideTimeout.current);
                hideTimeout.current = null;
            }
        }
    }, [forceShow]);

    // 自分自身の行にはリアクションボタンを表示しない（受信カウントのみ表示）
    if (isSelf) {
        if (!hasAnyReactions) return null;
        return (
            <div className={`flex items-center gap-0.5 ${compact ? '' : 'mt-0.5'} flex-wrap`}>
                {activeEmojis.map(emoji => {
                    const { count } = reactionCounts[emoji];
                    return (
                        <span
                            key={emoji}
                            className={`inline-flex items-center gap-0.5 rounded-full bg-[var(--theme-primary-light)] ${compact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-sm'}`}
                            title={t('receivedCount', { count })}
                        >
                            <span>{emoji}</span>
                            <span className="font-bold text-[var(--theme-primary)]">{count}</span>
                        </span>
                    );
                })}
            </div>
        );
    }

    // compact モード: バッジは常時表示、追加ボタン+ピッカーはホバー/長押しで表示
    // forceShow が唯一の開閉トリガー（onMouseEnter/Leave 不要）
    // バッジが多い場合は MAX_VISIBLE_BADGES 個まで表示し、残りは "+N" で省略
    if (compact) {
        const isActive = forceShow;

        // リアクションもアクティブ状態もない場合、何もレンダリングしない（垂直中央揃えのため）
        if (!hasAnyReactions && !isActive) return null;

        const visibleEmojis = activeEmojis.slice(0, maxVisibleBadges);
        const hiddenCount = activeEmojis.length - visibleEmojis.length;
        return (
            <div
                className="relative inline-flex items-center gap-0.5"
                ref={pickerRef}
            >
                {/* 既存リアクションバッジ — 最大 MAX_VISIBLE_BADGES 個表示 */}
                {visibleEmojis.map(emoji => {
                    const { count, reacted } = reactionCounts[emoji];
                    return (
                        <button
                            key={emoji}
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleToggle(emoji);
                            }}
                            disabled={loading === emoji}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs min-h-[22px] rounded-full transition-all duration-200 cursor-pointer
                                ${reacted
                                    ? 'bg-[var(--theme-primary-light)] text-[var(--theme-primary)] ring-1 ring-[var(--theme-primary)]/30'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                                }
                                ${loading === emoji ? 'opacity-50' : ''}
                            `}
                            title={reacted ? t('removeReaction') : t('addReaction')}
                        >
                            <span className={loading === emoji ? 'animate-pulse' : ''}>{emoji}</span>
                            <span className="font-bold">{count}</span>
                        </button>
                    );
                })}
                {/* 省略表示 — 表示しきれないバッジ数を "+N" で表示 */}
                {hiddenCount > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-xs min-h-[22px] rounded-full bg-gray-100 text-gray-600 font-bold">
                        +{hiddenCount}
                    </span>
                )}

                {/* 追加ボタン（＋アイコン）— ホバー/長押し時のみ表示 */}
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowPicker(prev => !prev);
                    }}
                    className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-gray-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-light)] transition-all duration-200 cursor-pointer"
                    aria-label={t('addReaction')}
                    style={{ opacity: isActive ? 1 : 0, pointerEvents: isActive ? 'auto' : 'none', transition: 'opacity 200ms ease' }}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                    </svg>
                </button>

                {/* クイックリアクションピッカー — ＋ボタン下に吹き出しで表示 */}
                {showPicker && !showExtended && (
                    <div
                        className="absolute z-[9999] flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-white border border-gray-200 shadow-lg midnight-solid-panel left-0 top-full mt-1.5"
                        style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.15))' }}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                    >
                        {/* 吹き出し三角（上向き） */}
                        <div className="absolute -top-1.5 left-3 w-3 h-3 bg-white border-l border-t border-gray-200 transform rotate-45" />
                        {DEFAULT_EMOJIS.map(emoji => {
                            const reacted = reactionCounts[emoji]?.reacted ?? false;
                            const isLoading = loading === emoji;
                            return (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggle(emoji);
                                    }}
                                    disabled={isLoading}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center text-base transition-all duration-150 cursor-pointer
                                        ${reacted
                                            ? 'bg-[var(--theme-primary-light)] scale-110 ring-2 ring-[var(--theme-primary)]/30'
                                            : 'hover:bg-gray-100 hover:scale-125'
                                        }
                                        ${isLoading ? 'opacity-50 animate-pulse' : ''}
                                    `}
                                    title={reacted ? t('removeReaction') : t('addReaction')}
                                    aria-label={`${reacted ? t('removeReaction') : t('addReaction')} ${emoji}`}
                                >
                                    {emoji}
                                </button>
                            );
                        })}
                        <div className="w-px h-5 bg-gray-200 mx-0.5" />
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowExtended(true);
                            }}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-[var(--theme-primary)] hover:bg-gray-100 transition-all duration-150 cursor-pointer"
                            title={t('moreReactions')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                <path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM15.5 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* 拡張絵文字ピッカー — ＋ボタン下に吹き出しで表示 */}
                {showExtended && (
                    <div
                        className="absolute z-[9999] w-[220px] rounded-xl bg-white border border-gray-200 shadow-xl midnight-solid-panel overflow-visible left-0 top-full mt-1.5"
                        style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.2))' }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                    >
                        {/* 吹き出し三角（上向き） */}
                        <div className="absolute -top-1.5 left-3 w-3 h-3 bg-white border-l border-t border-gray-200 transform rotate-45 z-50" />
                        <div className="flex items-center border-b border-gray-100 px-1 pt-1">
                            {EXTENDED_EMOJI_CATEGORIES.map((cat, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setActiveCategory(idx)}
                                    className={`flex-1 py-1.5 text-center text-sm rounded-t-lg transition-colors cursor-pointer
                                        ${activeCategory === idx
                                            ? 'bg-[var(--theme-primary-light)] text-[var(--theme-primary)]'
                                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                                        }
                                    `}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-4 gap-0.5 p-2">
                            {EXTENDED_EMOJI_CATEGORIES[activeCategory].emojis.map(emoji => {
                                const reacted = reactionCounts[emoji]?.reacted ?? false;
                                const isLoading = loading === emoji;
                                return (
                                    <button
                                        key={emoji}
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggle(emoji);
                                        }}
                                        disabled={isLoading}
                                        className={`w-full aspect-square rounded-lg flex items-center justify-center text-xl transition-all duration-150 cursor-pointer
                                            ${reacted
                                                ? 'bg-[var(--theme-primary-light)] ring-2 ring-[var(--theme-primary)]/30 scale-105'
                                                : 'hover:bg-gray-100 hover:scale-110'
                                            }
                                            ${isLoading ? 'opacity-50 animate-pulse' : ''}
                                        `}
                                        title={reacted ? t('removeReaction') : t('addReaction')}
                                        aria-label={`${reacted ? t('removeReaction') : t('addReaction')} ${emoji}`}
                                    >
                                        {emoji}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            className={`relative inline-flex items-center gap-0.5 ${compact ? '' : 'mt-0.5'}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            ref={pickerRef}
        >
            {/* 既存リアクション（カウント付き）を常時表示 */}
            {activeEmojis.map(emoji => {
                const { count, reacted } = reactionCounts[emoji];
                return (
                    <button
                        key={emoji}
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleToggle(emoji);
                        }}
                        disabled={loading === emoji}
                        className={`inline-flex items-center gap-1 rounded-full transition-all duration-200 cursor-pointer
                            ${compact ? 'px-1.5 py-0.5 text-xs min-h-[22px]' : 'px-2 py-0.5 text-sm min-h-[26px]'}
                            ${reacted
                                ? 'bg-[var(--theme-primary-light)] text-[var(--theme-primary)] ring-1 ring-[var(--theme-primary)]/30 scale-105'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                            }
                            ${loading === emoji ? 'opacity-50' : ''}
                        `}
                        title={reacted ? t('removeReaction') : t('addReaction')}
                    >
                        <span className={loading === emoji ? 'animate-pulse' : ''}>{emoji}</span>
                        <span className="font-bold">{count}</span>
                    </button>
                );
            })}

            {/* リアクション追加トリガー（スマイルアイコン） */}
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setShowPicker(prev => !prev);
                }}
                className={`inline-flex items-center justify-center rounded-full text-gray-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-light)] transition-all duration-200 cursor-pointer
                    ${compact ? 'w-[22px] h-[22px]' : 'w-[26px] h-[26px]'}
                `}
                aria-label={t('addReaction')}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}>
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.536-4.464a.75.75 0 10-1.06-1.06 3.5 3.5 0 01-4.95 0 .75.75 0 00-1.06 1.06 5 5 0 007.07 0zM9 8.5c0 .828-.448 1.5-1 1.5s-1-.672-1-1.5S7.448 7 8 7s1 .672 1 1.5zm3 1.5c.552 0 1-.672 1-1.5S12.552 7 12 7s-1 .672-1 1.5.448 1.5 1 1.5z" clipRule="evenodd" />
                </svg>
            </button>

            {/* クイックリアクションピッカー（ホバー or クリックで表示） */}
            {showPicker && !showExtended && (
                <div
                    className="absolute left-0 bottom-full mb-1 z-30 flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-white border border-gray-200 shadow-lg midnight-solid-panel"
                    style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.15))' }}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    {DEFAULT_EMOJIS.map(emoji => {
                        const reacted = reactionCounts[emoji]?.reacted ?? false;
                        const isLoading = loading === emoji;
                        return (
                            <button
                                key={emoji}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggle(emoji);
                                }}
                                disabled={isLoading}
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-base transition-all duration-150 cursor-pointer
                                    ${reacted
                                        ? 'bg-[var(--theme-primary-light)] scale-110 ring-2 ring-[var(--theme-primary)]/30'
                                        : 'hover:bg-gray-100 hover:scale-125'
                                    }
                                    ${isLoading ? 'opacity-50 animate-pulse' : ''}
                                `}
                                title={reacted ? t('removeReaction') : t('addReaction')}
                                aria-label={`${emoji} ${reacted ? t('removeReaction') : t('addReaction')}`}
                            >
                                {emoji}
                            </button>
                        );
                    })}
                    {/* 拡張ピッカーへの展開ボタン */}
                    <div className="w-px h-5 bg-gray-200 mx-0.5" />
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowExtended(true);
                        }}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-[var(--theme-primary)] hover:bg-gray-100 transition-all duration-150 cursor-pointer"
                        title={t('moreReactions')}
                        aria-label={t('moreReactions')}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM15.5 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
                        </svg>
                    </button>
                </div>
            )}

            {/* 拡張絵文字ピッカー（Teams 風グリッド表示） */}
            {showExtended && (
                <div
                    className="absolute left-0 bottom-full mb-1 z-40 w-[220px] rounded-xl bg-white border border-gray-200 shadow-xl midnight-solid-panel overflow-hidden"
                    style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.2))' }}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* カテゴリタブ */}
                    <div className="flex items-center border-b border-gray-100 px-1 pt-1">
                        {EXTENDED_EMOJI_CATEGORIES.map((cat, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => setActiveCategory(idx)}
                                className={`flex-1 py-1.5 text-center text-sm rounded-t-lg transition-colors cursor-pointer
                                    ${activeCategory === idx
                                        ? 'bg-[var(--theme-primary-light)] text-[var(--theme-primary)]'
                                        : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                                    }
                                `}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                    {/* 絵文字グリッド */}
                    <div className="grid grid-cols-4 gap-0.5 p-2">
                        {EXTENDED_EMOJI_CATEGORIES[activeCategory].emojis.map(emoji => {
                            const reacted = reactionCounts[emoji]?.reacted ?? false;
                            const isLoading = loading === emoji;
                            return (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggle(emoji);
                                    }}
                                    disabled={isLoading}
                                    className={`w-full aspect-square rounded-lg flex items-center justify-center text-xl transition-all duration-150 cursor-pointer
                                        ${reacted
                                            ? 'bg-[var(--theme-primary-light)] ring-2 ring-[var(--theme-primary)]/30 scale-105'
                                            : 'hover:bg-gray-100 hover:scale-110'
                                        }
                                        ${isLoading ? 'opacity-50 animate-pulse' : ''}
                                    `}
                                    title={reacted ? t('removeReaction') : t('addReaction')}
                                >
                                    {emoji}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
