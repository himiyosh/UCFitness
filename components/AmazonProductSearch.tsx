'use client';

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/ui/Spinner';

// ============================================
// Amazon アフィリエイトリンク生成ツール
// API不要 — キーワード/ASIN/URLからリンクを即時生成
// キーワード検索時は商品候補画像を表示（次/前で切替可能）
// ============================================

// --- 型定義 ---

type AffiliateLinkType = 'product' | 'search' | 'tagged-url';

interface SearchCandidate {
    asin: string;
    title: string;
    imageUrl: string;
    affiliateLink: string;
}

interface GenerateResult {
    affiliateLink: string;
    type: AffiliateLinkType;
    imageUrl?: string;
    asin?: string;
    keyword?: string;
    category?: string;
    candidates?: SearchCandidate[];
}

interface LinkHistoryItem extends GenerateResult {
    id: string;
    input: string;
    createdAt: Date;
}

interface AmazonProductSearchProps {
    locale: string;
    /** モーダルから追加した際にアイテムリストを更新するコールバック */
    onItemAdded?: (item: { id: string; asin: string; title: string; image_url: string; affiliate_link: string; display_order: number }) => void;
}

// --- 入力タイプ判定（クライアント側プレビュー用） ---
function detectInputType(input: string): { type: AffiliateLinkType; label: string; icon: string } {
    if (!input.trim()) return { type: 'search', label: '', icon: '' };

    if (/^[A-Z0-9]{10}$/i.test(input.trim())) {
        return { type: 'product', label: 'ASIN', icon: '📦' };
    }
    if (/(?:dp|product|ASIN)\/([A-Z0-9]{10})/i.test(input)) {
        return { type: 'product', label: 'Amazon商品URL', icon: '🔗' };
    }
    try {
        const url = new URL(input);
        if (url.hostname.includes('amazon')) {
            return { type: 'tagged-url', label: 'Amazon URL', icon: '🔗' };
        }
    } catch { /* not a URL */ }

    return { type: 'search', label: 'キーワード検索', icon: '🔍' };
}

// --- リンクタイプのラベル ---
function linkTypeLabel(type: AffiliateLinkType, locale: string): string {
    const labels: Record<AffiliateLinkType, Record<string, string>> = {
        product: { ja: '商品ページリンク', en: 'Product Page Link' },
        search: { ja: '検索ページリンク', en: 'Search Page Link' },
        'tagged-url': { ja: 'タグ付きURL', en: 'Tagged URL' },
    };
    return labels[type]?.[locale] || labels[type]?.en || type;
}

function linkTypeIcon(type: AffiliateLinkType): string {
    return { product: '📦', search: '🔍', 'tagged-url': '🔗' }[type] || '🔗';
}

// ============================================
// メインコンポーネント
// ============================================

export default function AmazonProductSearch({ locale, onItemAdded }: AmazonProductSearchProps) {
    const t = useTranslations('Recommendations');
    const { success: toastSuccess, error: toastError } = useToast();

    const [input, setInput] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [latestResult, setLatestResult] = useState<GenerateResult | null>(null);
    const [history, setHistory] = useState<LinkHistoryItem[]>([]);
    const [candidateIndex, setCandidateIndex] = useState(0);
    const [isSavingRecommended, setIsSavingRecommended] = useState(false);
    const [savedAsins, setSavedAsins] = useState<Set<string>>(new Set());
    const [commentDraft, setCommentDraft] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);

    // --- 入力タイプのリアルタイム検知 ---
    const inputInfo = useMemo(() => detectInputType(input), [input]);

    // --- リンク生成 ---
    const handleGenerate = useCallback(async () => {
        if (!input.trim()) return;

        setIsGenerating(true);
        setLatestResult(null);
        setCandidateIndex(0);

        try {
            const isKeyword = inputInfo.type === 'search';
            const res = await fetch('/api/amazon/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: input.trim(),
                    category: isKeyword ? 'All' : undefined,
                    withCandidates: isKeyword,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Generation failed');
            }

            const result: GenerateResult = await res.json();
            setLatestResult(result);

            // 履歴に追加
            const historyItem: LinkHistoryItem = {
                ...result,
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                input: input.trim(),
                createdAt: new Date(),
            };
            setHistory(prev => [historyItem, ...prev].slice(0, 20)); // 最大20件

            toastSuccess(t('linkGenerated'));
        } catch (_error: unknown) {
            toastError(t('generateError'));
        } finally {
            setIsGenerating(false);
        }
    }, [input, inputInfo.type, t, toastSuccess, toastError]);

    // --- Enter キーで生成 ---
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleGenerate();
        }
    }, [handleGenerate]);

    // --- 履歴アイテムを再利用 ---
    const reuseHistoryItem = useCallback((item: LinkHistoryItem) => {
        setInput(item.input);
        setLatestResult(item);
        setCandidateIndex(0);
        inputRef.current?.focus();
    }, []);

    // --- 選択中の商品候補 ---
    const candidates = useMemo(() => latestResult?.candidates || [], [latestResult?.candidates]);
    const selectedCandidate = useMemo(() => candidates.length > 0 ? candidates[candidateIndex] : null, [candidates, candidateIndex]);
    // 候補がある場合は選択中の候補のリンクを優先表示
    const displayLink = useMemo(() => selectedCandidate ? selectedCandidate.affiliateLink : latestResult?.affiliateLink || '', [selectedCandidate, latestResult?.affiliateLink]);

    // --- 候補ナビゲーション ---
    const goNextCandidate = useCallback(() => {
        setCandidateIndex(prev => Math.min(prev + 1, candidates.length - 1));
    }, [candidates.length]);
    const goPrevCandidate = useCallback(() => {
        setCandidateIndex(prev => Math.max(prev - 1, 0));
    }, []);

    // --- おすすめアイテムに追加 ---
    const handleAddRecommended = useCallback(async () => {
        // ASIN付き商品を決定（候補がない場合は latestResult から情報を引き継ぐ）
        const target = selectedCandidate || (latestResult?.asin ? {
            asin: latestResult.asin,
            title: '', // タイトルはサーバー側で自動取得される
            imageUrl: latestResult.imageUrl || '',
            affiliateLink: latestResult.affiliateLink,
        } : null);
        if (!target) return;

        setIsSavingRecommended(true);
        try {
            const res = await fetch('/api/amazon/recommended', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asin: target.asin,
                    title: target.title,
                    imageUrl: target.imageUrl,
                    affiliateLink: target.affiliateLink,
                    comment: commentDraft.trim() || undefined,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                if (err.code === 'MAX_ITEMS') {
                    toastError(locale === 'ja' ? 'おすすめは最大6件です' : 'Maximum 6 items allowed');
                } else {
                    throw new Error(err.error);
                }
                return;
            }

            const result = await res.json();
            setSavedAsins(prev => new Set(prev).add(target.asin));
            setCommentDraft('');
            toastSuccess(locale === 'ja' ? 'おすすめに追加しました！' : 'Added to recommended!');

            // コールバックで親コンポーネントに通知
            if (onItemAdded && result?.item) {
                onItemAdded(result.item);
            }
        } catch {
            toastError(locale === 'ja' ? '保存に失敗しました' : 'Failed to save');
        } finally {
            setIsSavingRecommended(false);
        }
    }, [selectedCandidate, latestResult, commentDraft, locale, toastSuccess, toastError, onItemAdded]);

    // 現在の商品が追加可能かどうか
    const currentAsin = useMemo(() => selectedCandidate?.asin || latestResult?.asin, [selectedCandidate?.asin, latestResult?.asin]);
    const isAlreadySaved = useMemo(() => currentAsin ? savedAsins.has(currentAsin) : false, [currentAsin, savedAsins]);
    const canAddRecommended = useMemo(() => !!currentAsin && !isAlreadySaved, [currentAsin, isAlreadySaved]);

    return (
        <div className="space-y-5">
            {/* ========== 入力エリア ========== */}
            <div className="flex gap-2">
                <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={locale === 'ja' ? '商品名や Amazon URL を入力' : 'Product name or Amazon URL'}
                    aria-label={t('directDescription')}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent focus:bg-white transition-colors"
                />
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !input.trim()}
                    className="px-5 py-3 bg-gradient-to-r from-[var(--theme-gradient-from)] to-[var(--theme-gradient-to)] text-white font-bold rounded-xl shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap min-w-[60px] flex items-center justify-center"
                >
                    {isGenerating ? <Spinner /> : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                        </svg>
                    )}
                </button>
            </div>

            {/* ========== 生成結果 ========== */}
            {latestResult && (
                <div className="space-y-4">
                    {/* 商品プレビュー（ASIN直接指定の場合） */}
                    {latestResult.type !== 'search' && latestResult.imageUrl && (
                        <a
                            href={latestResult.affiliateLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex gap-4 items-center bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
                        >
                            <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={latestResult.imageUrl}
                                    alt={latestResult.asin || 'Product'}
                                    className="max-w-full max-h-full object-contain"
                                    loading="lazy"
                                />
                            </div>
                            <p className="text-xs text-gray-400">
                                {locale === 'ja' ? 'タップで Amazon で確認 →' : 'Tap to view on Amazon →'}
                            </p>
                        </a>
                    )}

                    {/* キーワード検索の場合: 商品候補カルーセル */}
                    {latestResult.type === 'search' && selectedCandidate && (
                        <div className="space-y-3">
                            {/* 商品画像 + ナビゲーション */}
                            <div className="flex items-center gap-2">
                                {/* ← 前へ */}
                                <button
                                    onClick={goPrevCandidate}
                                    disabled={candidateIndex === 0}
                                    className="flex-shrink-0 w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-300 active:scale-95 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                                    title={locale === 'ja' ? '前の商品' : 'Previous'}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                                    </svg>
                                </button>

                                {/* 商品プレビュー */}
                                <a
                                    href={selectedCandidate.affiliateLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 flex flex-col items-center gap-2 bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
                                >
                                    <div className="w-44 h-44 flex items-center justify-center">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={selectedCandidate.imageUrl}
                                            alt={selectedCandidate.title || selectedCandidate.asin}
                                            className="w-full h-full object-contain"
                                            loading="lazy"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = `https://ws-fe.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${selectedCandidate.asin}&Format=_SL250_&ID=AsinImage&MarketPlace=JP&ServiceVersion=20070822&WS=1&tag=${encodeURIComponent('studio344-22')}`;
                                            }}
                                        />
                                    </div>
                                    {selectedCandidate.title && (
                                        <p className="text-sm text-gray-700 text-center line-clamp-2">
                                            {selectedCandidate.title}
                                        </p>
                                    )}
                                </a>

                                {/* → 次へ */}
                                <button
                                    onClick={goNextCandidate}
                                    disabled={candidateIndex >= candidates.length - 1}
                                    className="flex-shrink-0 w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-300 active:scale-95 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                                    title={locale === 'ja' ? '次の商品' : 'Next'}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>

                            {/* ドットインジケーター */}
                            <div className="flex items-center justify-center gap-1">
                                {candidates.map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setCandidateIndex(i)}
                                        className={`h-1.5 rounded-full transition-all ${
                                            i === candidateIndex
                                                ? 'w-4 bg-[var(--theme-primary)]'
                                                : 'w-1.5 bg-gray-200 hover:bg-gray-300'
                                        }`}
                                        aria-label={`Product ${i + 1}`}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* キーワード検索で候補なしの場合 */}
                    {latestResult.type === 'search' && !selectedCandidate && (
                        <a
                            href={latestResult.affiliateLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow"
                        >
                            <span className="text-2xl">🔍</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-700">
                                    &quot;{latestResult.keyword}&quot;
                                </p>
                                <p className="text-xs text-gray-400">
                                    {locale === 'ja' ? 'Amazon で検索結果を見る →' : 'View on Amazon →'}
                                </p>
                            </div>
                        </a>
                    )}

                    {/* コメント入力欄 */}
                    {canAddRecommended && (
                        <input
                            type="text"
                            value={commentDraft}
                            onChange={e => setCommentDraft(e.target.value)}
                            maxLength={100}
                            placeholder={locale === 'ja' ? '💬 コメント（任意）例: 毎日愛用してます！' : '💬 Comment (optional) e.g. My daily essential!'}
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-transparent focus:bg-white transition-colors"
                        />
                    )}

                    {/* 追加ボタン */}
                    {canAddRecommended && (
                        <button
                            onClick={handleAddRecommended}
                            disabled={isSavingRecommended}
                            className="w-full px-4 py-3.5 bg-[var(--theme-primary)] text-white font-bold rounded-xl shadow-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            {isSavingRecommended
                                ? (locale === 'ja' ? '保存中...' : 'Saving...')
                                : (locale === 'ja' ? 'この商品をプロフィールに追加' : 'Add to Profile')}
                        </button>
                    )}
                    {isAlreadySaved && (
                        <div className="w-full px-4 py-3 bg-gray-50 text-gray-500 font-medium rounded-xl text-center text-sm border border-gray-200">
                            ✓ {locale === 'ja' ? '追加済み' : 'Already added'}
                        </div>
                    )}
                </div>
            )}

            {/* ========== 初期状態のヒント ========== */}
            {!latestResult && history.length === 0 && (
                <div className="space-y-2 pt-2">
                    <p className="text-xs font-semibold text-gray-500">
                        {locale === 'ja' ? '💡 こんな風に入力してください' : '💡 How to enter'}
                    </p>
                    <div className="flex flex-col gap-1.5 pl-4">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="w-4 text-center shrink-0 text-sm">🔍</span>
                            <span className="w-[5.5rem] shrink-0 font-medium text-gray-600">{locale === 'ja' ? 'キーワード' : 'Keyword'}</span>
                            <span className="font-mono text-gray-400">{locale === 'ja' ? 'ランニングシューズ' : 'running shoes'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="w-4 text-center shrink-0 text-sm">🔗</span>
                            <span className="w-[5.5rem] shrink-0 font-medium text-gray-600">Amazon URL</span>
                            <span className="font-mono text-gray-400">amazon.co.jp/dp/...</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="w-4 text-center shrink-0 text-sm">📦</span>
                            <span className="w-[5.5rem] shrink-0 font-medium text-gray-600">ASIN</span>
                            <span className="font-mono text-gray-400">B0DGJCRNY3</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ========== 生成履歴 ========== */}
            {history.length > 0 && (
                <div className="space-y-3">
                    <h4 className="text-sm font-bold text-gray-500 flex items-center gap-2">
                        <span>📝</span>
                        {locale === 'ja' ? '生成履歴' : 'History'}
                        <span className="text-xs font-normal text-gray-400">
                            ({history.length})
                        </span>
                    </h4>

                    <div className="space-y-2">
                        {history.map(item => (
                            <div
                                key={item.id}
                                className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 p-3 hover:shadow-sm transition-shadow group"
                            >
                                {/* サムネイル or アイコン */}
                                {item.imageUrl ? (
                                    <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-gray-50 border border-gray-100">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={item.imageUrl}
                                            alt={item.asin || ''}
                                            className="w-full h-full object-contain"
                                            loading="lazy"
                                            onError={(e) => {
                                                const parent = (e.target as HTMLElement).parentElement;
                                                if (parent) parent.innerHTML = `<span class="flex items-center justify-center w-full h-full text-lg">${linkTypeIcon(item.type)}</span>`;
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <span className="text-lg flex-shrink-0">{linkTypeIcon(item.type)}</span>
                                )}

                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900 truncate">
                                        {item.input}
                                    </div>
                                </div>

                                <div className="flex gap-1.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => reuseHistoryItem(item)}
                                        className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200 transition-all"
                                        title={locale === 'ja' ? '再利用' : 'Reuse'}
                                    >
                                        ↩️
                                    </button>
                                    <a
                                        href={item.affiliateLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-[var(--theme-primary-light)] text-[var(--theme-primary)] border border-[var(--theme-primary)]/20 hover:opacity-80 transition-all"
                                        title={t('viewOnAmazon')}
                                    >
                                        🛒
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}


