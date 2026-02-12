'use client';

import React, { useState, useCallback, useRef } from 'react';
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

type SearchCategory =
    | 'All'
    | 'SportingGoods'
    | 'HealthPersonalCare'
    | 'Shoes'
    | 'Apparel'
    | 'Electronics'
    | 'Books';

interface AmazonProductSearchProps {
    locale: string;
}

// --- カテゴリ定義 ---
const CATEGORIES: { key: SearchCategory; icon: string; labelKey: string }[] = [
    { key: 'All', icon: '🔍', labelKey: 'categoryAll' },
    { key: 'SportingGoods', icon: '🏃', labelKey: 'categorySports' },
    { key: 'HealthPersonalCare', icon: '💊', labelKey: 'categoryHealth' },
    { key: 'Shoes', icon: '👟', labelKey: 'categoryShoes' },
    { key: 'Apparel', icon: '👕', labelKey: 'categoryApparel' },
    { key: 'Electronics', icon: '📱', labelKey: 'categoryElectronics' },
    { key: 'Books', icon: '📚', labelKey: 'categoryBooks' },
];

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

export default function AmazonProductSearch({ locale }: AmazonProductSearchProps) {
    const t = useTranslations('Recommendations');
    const { success: toastSuccess, error: toastError } = useToast();

    const [input, setInput] = useState('');
    const [category, setCategory] = useState<SearchCategory>('All');
    const [isGenerating, setIsGenerating] = useState(false);
    const [latestResult, setLatestResult] = useState<GenerateResult | null>(null);
    const [history, setHistory] = useState<LinkHistoryItem[]>([]);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [candidateIndex, setCandidateIndex] = useState(0);
    const [isSavingRecommended, setIsSavingRecommended] = useState(false);
    const [savedAsins, setSavedAsins] = useState<Set<string>>(new Set());

    const inputRef = useRef<HTMLInputElement>(null);
    const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // --- 入力タイプのリアルタイム検知 ---
    const inputInfo = detectInputType(input);
    const showCategorySelector = inputInfo.type === 'search' && input.trim().length > 0;

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
                    category: isKeyword ? category : undefined,
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
        } catch (error) {
            console.error('リンク生成エラー:', error);
            toastError(t('generateError'));
        } finally {
            setIsGenerating(false);
        }
    }, [input, category, inputInfo.type, t, toastSuccess, toastError]);

    // --- クリップボードにコピー ---
    const copyToClipboard = useCallback(async (text: string, id?: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toastSuccess(t('copied'));
            if (id) {
                setCopiedId(id);
                if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
                copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
            }
        } catch {
            toastError(t('copyFailed'));
        }
    }, [t, toastSuccess, toastError]);

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
    const candidates = latestResult?.candidates || [];
    const selectedCandidate = candidates.length > 0 ? candidates[candidateIndex] : null;
    // 候補がある場合は選択中の候補のリンクを優先表示
    const displayLink = selectedCandidate ? selectedCandidate.affiliateLink : latestResult?.affiliateLink || '';

    // --- 候補ナビゲーション ---
    const goNextCandidate = useCallback(() => {
        setCandidateIndex(prev => Math.min(prev + 1, candidates.length - 1));
    }, [candidates.length]);
    const goPrevCandidate = useCallback(() => {
        setCandidateIndex(prev => Math.max(prev - 1, 0));
    }, []);

    // --- おすすめアイテムに追加 ---
    const handleAddRecommended = useCallback(async () => {
        // ASIN付き商品を決定
        const target = selectedCandidate || (latestResult?.asin ? {
            asin: latestResult.asin,
            title: '',
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

            setSavedAsins(prev => new Set(prev).add(target.asin));
            toastSuccess(locale === 'ja' ? 'おすすめに追加しました！' : 'Added to recommended!');
        } catch {
            toastError(locale === 'ja' ? '保存に失敗しました' : 'Failed to save');
        } finally {
            setIsSavingRecommended(false);
        }
    }, [selectedCandidate, latestResult, locale, toastSuccess, toastError]);

    // 現在の商品が追加可能かどうか
    const currentAsin = selectedCandidate?.asin || latestResult?.asin;
    const isAlreadySaved = currentAsin ? savedAsins.has(currentAsin) : false;
    const canAddRecommended = !!currentAsin && !isAlreadySaved;

    return (
        <div className="space-y-6">
            {/* ========== 入力エリア ========== */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
                {/* 入力フィールド */}
                <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700">
                        {t('directDescription')}
                    </label>
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={t('directPlaceholder')}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent pr-24"
                            />
                            {/* 入力タイプバッジ */}
                            {input.trim() && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                                    {inputInfo.icon} {inputInfo.label}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !input.trim()}
                            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                            {isGenerating ? <Spinner /> : t('generateButton')}
                        </button>
                    </div>
                </div>

                {/* カテゴリ選択（キーワード検索時のみ表示） */}
                {showCategorySelector && (
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-500">
                            {locale === 'ja' ? '📂 カテゴリで絞り込み（任意）' : '📂 Filter by category (optional)'}
                        </label>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat.key}
                                    onClick={() => setCategory(cat.key)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                                        category === cat.key
                                            ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    <span>{cat.icon}</span>
                                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                    {t(cat.labelKey as any)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ========== 生成結果 ========== */}
            {latestResult && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="text-green-600 text-xl">✅</span>
                        <span className="font-bold text-green-800">{t('linkReady')}</span>
                        <span className="ml-auto text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">
                            {linkTypeIcon(latestResult.type)} {linkTypeLabel(latestResult.type, locale)}
                        </span>
                    </div>

                    {/* 商品プレビュー（ASINがある場合） */}
                    {latestResult.imageUrl && (
                        <div className="flex gap-4 items-start">
                            <a
                                href={latestResult.affiliateLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 w-28 h-28 rounded-xl overflow-hidden bg-white border border-green-100 flex items-center justify-center hover:shadow-md transition-shadow"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={latestResult.imageUrl}
                                    alt={latestResult.asin || 'Product'}
                                    className="max-w-full max-h-full object-contain"
                                    loading="lazy"
                                    onError={(e) => {
                                        // 画像が読み込めない場合は非表示
                                        (e.target as HTMLElement).closest('.flex-shrink-0')?.classList.add('hidden');
                                    }}
                                />
                            </a>
                            <div className="flex-1 space-y-1.5">
                                <span className="font-mono text-sm bg-green-100 px-2 py-0.5 rounded border border-green-200 text-green-700">
                                    ASIN: {latestResult.asin}
                                </span>
                                <p className="text-xs text-gray-500">
                                    {locale === 'ja' ? 'クリックで Amazon で確認' : 'Click to view on Amazon'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ASIN のみ表示（画像なし） */}
                    {latestResult.asin && !latestResult.imageUrl && (
                        <div className="flex items-center gap-2 text-sm text-green-700">
                            <span className="font-mono bg-green-100 px-2 py-0.5 rounded border border-green-200">
                                ASIN: {latestResult.asin}
                            </span>
                        </div>
                    )}

                    {/* キーワード検索の場合: 商品候補カルーセル or ブランドカード */}
                    {latestResult.type === 'search' && selectedCandidate && (
                        <div className="space-y-3">
                            {/* 商品画像 + ナビゲーション */}
                            <div className="flex items-center gap-3">
                                {/* ← 前へ */}
                                <button
                                    onClick={goPrevCandidate}
                                    disabled={candidateIndex === 0}
                                    className="flex-shrink-0 w-10 h-10 rounded-full bg-white border border-green-200 flex items-center justify-center text-lg hover:bg-green-50 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={locale === 'ja' ? '前の商品' : 'Previous product'}
                                >
                                    ◀
                                </button>

                                {/* 商品プレビュー */}
                                <a
                                    href={selectedCandidate.affiliateLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 flex flex-col items-center gap-2 bg-white rounded-xl border border-green-100 p-4 hover:shadow-md transition-shadow group"
                                >
                                    <div className="w-36 h-36 flex items-center justify-center">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={selectedCandidate.imageUrl}
                                            alt={selectedCandidate.title || selectedCandidate.asin}
                                            className="max-w-full max-h-full object-contain"
                                            loading="lazy"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = `https://ws-fe.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${selectedCandidate.asin}&Format=_SL250_&ID=AsinImage&MarketPlace=JP&ServiceVersion=20070822&WS=1&tag=${encodeURIComponent('hiroyukimiyos-22')}`;
                                            }}
                                        />
                                    </div>
                                    {selectedCandidate.title && (
                                        <p className="text-sm text-gray-700 text-center line-clamp-2 group-hover:text-orange-600 transition-colors">
                                            {selectedCandidate.title}
                                        </p>
                                    )}
                                    <span className="font-mono text-xs bg-green-100 px-2 py-0.5 rounded border border-green-200 text-green-700">
                                        ASIN: {selectedCandidate.asin}
                                    </span>
                                </a>

                                {/* → 次へ */}
                                <button
                                    onClick={goNextCandidate}
                                    disabled={candidateIndex >= candidates.length - 1}
                                    className="flex-shrink-0 w-10 h-10 rounded-full bg-white border border-green-200 flex items-center justify-center text-lg hover:bg-green-50 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={locale === 'ja' ? '次の商品' : 'Next product'}
                                >
                                    ▶
                                </button>
                            </div>

                            {/* インジケーター */}
                            <div className="flex items-center justify-center gap-2">
                                <span className="text-xs font-bold text-green-700 bg-green-100 px-3 py-1 rounded-full">
                                    {candidateIndex + 1} / {candidates.length}
                                </span>
                                <span className="text-xs text-gray-400">
                                    {locale === 'ja' ? '← → で商品を切り替え' : '← → to browse products'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* キーワード検索で候補なしの場合: Amazon検索ブランドカード */}
                    {latestResult.type === 'search' && !selectedCandidate && (
                        <a
                            href={latestResult.affiliateLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 bg-white rounded-xl border border-green-100 p-3 hover:shadow-md transition-shadow group"
                        >
                            <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-gradient-to-br from-orange-400 to-amber-300 flex items-center justify-center text-2xl shadow-sm">
                                🔍
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors">
                                    &quot;{latestResult.keyword}&quot;
                                    {latestResult.category && latestResult.category !== 'All' && (
                                        <span className="ml-2 text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                            {latestResult.category}
                                        </span>
                                    )}
                                </p>
                                <p className="text-xs text-gray-400">
                                    {locale === 'ja' ? 'Amazon.co.jp で検索結果を見る →' : 'View search results on Amazon.co.jp →'}
                                </p>
                            </div>
                        </a>
                    )}

                    {/* 生成されたリンク */}
                    <div className="bg-white rounded-xl p-4 border border-green-100 break-all text-sm text-gray-700 font-mono leading-relaxed">
                        {displayLink}
                    </div>

                    {/* アクションボタン */}
                    <div className="flex flex-col gap-3">
                        {/* おすすめに追加ボタン（ASIN付き商品のみ） */}
                        {canAddRecommended && (
                            <button
                                onClick={handleAddRecommended}
                                disabled={isSavingRecommended}
                                className="w-full px-4 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black rounded-xl shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-base"
                            >
                                {isSavingRecommended
                                    ? (locale === 'ja' ? '⏳ 保存中...' : '⏳ Saving...')
                                    : (locale === 'ja' ? '✅ この商品に決定 — プロフィールに掲載' : '✅ Confirm — Add to Profile')}
                            </button>
                        )}
                        {isAlreadySaved && (
                            <div className="w-full px-4 py-3 bg-green-100 text-green-700 font-bold rounded-xl text-center border border-green-200">
                                ✅ {locale === 'ja' ? 'プロフィールに掲載済み' : 'Already on your profile'}
                            </div>
                        )}
                        <div className="flex gap-3">
                            <button
                                onClick={() => copyToClipboard(displayLink, 'latest')}
                                className={`flex-1 px-4 py-3 font-bold rounded-xl transition-all ${
                                    copiedId === 'latest'
                                        ? 'bg-green-200 text-green-800 border border-green-300'
                                        : 'bg-green-600 text-white hover:bg-green-700 active:scale-[0.98]'
                                }`}
                            >
                                {copiedId === 'latest' ? '✅' : '📋'} {t(copiedId === 'latest' ? 'copied' : 'copyLink')}
                            </button>
                            <a
                                href={displayLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 active:scale-[0.98] transition-all text-center"
                            >
                                🛒 {t('viewOnAmazon')}
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* ========== 使い方ヒント ========== */}
            {!latestResult && history.length === 0 && (
                <div className="bg-amber-50/50 border border-amber-200/50 rounded-2xl p-5">
                    <h4 className="font-bold text-amber-800 mb-3">
                        {locale === 'ja' ? '💡 使い方' : '💡 How to use'}
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <HintCard
                            icon="📦"
                            title={locale === 'ja' ? 'ASIN で指定' : 'By ASIN'}
                            example="B0DGJCRNY3"
                            desc={locale === 'ja' ? '10桁の商品コードを入力' : 'Enter 10-char product code'}
                        />
                        <HintCard
                            icon="🔗"
                            title={locale === 'ja' ? 'URL をコピペ' : 'Paste URL'}
                            example="amazon.co.jp/dp/B0DG..."
                            desc={locale === 'ja' ? 'Amazon商品ページのURLを貼付' : 'Paste Amazon product URL'}
                        />
                        <HintCard
                            icon="🔍"
                            title={locale === 'ja' ? 'キーワード検索' : 'By Keyword'}
                            example={locale === 'ja' ? 'ランニングシューズ' : 'running shoes'}
                            desc={locale === 'ja' ? '商品名やキーワードで検索リンク生成' : 'Generate search link'}
                        />
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
                                    <div className="text-xs text-gray-400 truncate font-mono">
                                        {item.affiliateLink}
                                    </div>
                                </div>

                                <div className="flex gap-1.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => copyToClipboard(item.affiliateLink, item.id)}
                                        className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                            copiedId === item.id
                                                ? 'bg-green-100 text-green-700 border border-green-300'
                                                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                                        }`}
                                        title={copiedId === item.id ? t('copied') : t('copyLink')}
                                    >
                                        {copiedId === item.id ? '✅' : '📋'}
                                    </button>
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
                                        className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-orange-100 text-orange-600 border border-orange-200 hover:bg-orange-200 transition-all"
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

// ============================================
// ヒントカード サブコンポーネント
// ============================================

function HintCard({ icon, title, example, desc }: { icon: string; title: string; example: string; desc: string }) {
    return (
        <div className="bg-white rounded-xl border border-amber-100 p-3 space-y-1">
            <div className="flex items-center gap-1.5">
                <span className="text-lg">{icon}</span>
                <span className="text-sm font-bold text-gray-800">{title}</span>
            </div>
            <div className="text-xs font-mono text-amber-700 bg-amber-50 px-2 py-1 rounded truncate">
                {example}
            </div>
            <div className="text-xs text-gray-500">{desc}</div>
        </div>
    );
}
