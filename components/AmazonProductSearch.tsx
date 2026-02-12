'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/ui/Spinner';

// ============================================
// Amazon 商品検索 & アフィリエイトリンク生成コンポーネント
// ============================================

// --- 型定義 ---

interface AmazonProduct {
    asin: string;
    title: string;
    url: string;
    imageUrl: string | null;
    price: string | null;
    rating: number | null;
    totalReviews: number | null;
    brand: string | null;
    category: string | null;
}

interface SearchResult {
    products: AmazonProduct[];
    totalResults: number;
    searchUrl: string;
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

// ============================================
// メインコンポーネント
// ============================================

export default function AmazonProductSearch({ locale }: AmazonProductSearchProps) {
    const t = useTranslations('Recommendations');
    const { success: toastSuccess, error: toastError } = useToast();

    const [keywords, setKeywords] = useState('');
    const [directInput, setDirectInput] = useState('');
    const [category, setCategory] = useState<SearchCategory>('All');
    const [results, setResults] = useState<SearchResult | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [generatedLink, setGeneratedLink] = useState<string | null>(null);
    const [activeMode, setActiveMode] = useState<'search' | 'direct'>('search');
    const [copiedAsin, setCopiedAsin] = useState<string | null>(null);

    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // --- 商品キーワード検索 ---
    const handleSearch = useCallback(async () => {
        if (!keywords.trim()) return;

        setIsSearching(true);
        setResults(null);
        setGeneratedLink(null);

        try {
            const res = await fetch('/api/amazon/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keywords: keywords.trim(), category }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Search failed');
            }

            const data: SearchResult = await res.json();
            setResults(data);

            if (data.products.length === 0) {
                toastError(t('noResults'));
            }
        } catch (error) {
            console.error('検索エラー:', error);
            toastError(t('searchError'));
        } finally {
            setIsSearching(false);
        }
    }, [keywords, category, t, toastError]);

    // --- 直接リンク生成 ---
    const handleDirectGenerate = useCallback(async () => {
        if (!directInput.trim()) return;

        setIsSearching(true);
        setGeneratedLink(null);

        try {
            const res = await fetch('/api/amazon/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asinOrUrl: directInput.trim() }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Generation failed');
            }

            const data = await res.json();
            setGeneratedLink(data.affiliateLink);
            toastSuccess(t('linkGenerated'));
        } catch (error) {
            console.error('リンク生成エラー:', error);
            toastError(t('generateError'));
        } finally {
            setIsSearching(false);
        }
    }, [directInput, t, toastSuccess, toastError]);

    // --- クリップボードにコピー ---
    const copyToClipboard = useCallback(async (text: string, asin?: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toastSuccess(t('copied'));
            if (asin) {
                setCopiedAsin(asin);
                if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                searchTimeoutRef.current = setTimeout(() => setCopiedAsin(null), 2000);
            }
        } catch {
            toastError(t('copyFailed'));
        }
    }, [t, toastSuccess, toastError]);

    // --- Enter キーで検索 ---
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (activeMode === 'search') handleSearch();
            else handleDirectGenerate();
        }
    }, [activeMode, handleSearch, handleDirectGenerate]);

    // --- 星評価表示 ---
    const renderStars = (rating: number | null) => {
        if (rating === null) return null;
        const full = Math.floor(rating);
        const half = rating - full >= 0.5;
        return (
            <span className="text-yellow-400 text-sm" title={`${rating}/5`}>
                {'★'.repeat(full)}{half ? '☆' : ''}{'·'.repeat(5 - full - (half ? 1 : 0))}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* --- モード切り替え --- */}
            <div className="flex bg-gray-100/80 rounded-lg p-1">
                <button
                    onClick={() => setActiveMode('search')}
                    className={`flex-1 px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                        activeMode === 'search'
                            ? 'bg-white text-orange-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    🔍 {t('searchMode')}
                </button>
                <button
                    onClick={() => setActiveMode('direct')}
                    className={`flex-1 px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                        activeMode === 'direct'
                            ? 'bg-white text-orange-600 shadow-sm'
                            : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    🔗 {t('directMode')}
                </button>
            </div>

            {/* ========== 検索モード ========== */}
            {activeMode === 'search' && (
                <div className="space-y-4">
                    {/* カテゴリ選択 */}
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

                    {/* 検索入力 */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={keywords}
                            onChange={e => setKeywords(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={t('searchPlaceholder')}
                            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                        />
                        <button
                            onClick={handleSearch}
                            disabled={isSearching || !keywords.trim()}
                            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSearching ? <Spinner /> : t('searchButton')}
                        </button>
                    </div>

                    {/* 検索結果 */}
                    {results && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm text-gray-500">
                                <span>{t('resultsCount', { count: results.totalResults })}</span>
                                <a
                                    href={results.searchUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-orange-600 hover:text-orange-700 font-medium"
                                >
                                    {t('viewOnAmazon')} →
                                </a>
                            </div>

                            <div className="grid gap-3">
                                {results.products.map(product => (
                                    <ProductCard
                                        key={product.asin}
                                        product={product}
                                        locale={locale}
                                        isCopied={copiedAsin === product.asin}
                                        onCopy={() => copyToClipboard(product.url, product.asin)}
                                        renderStars={renderStars}
                                        t={t}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ========== 直接リンク生成モード ========== */}
            {activeMode === 'direct' && (
                <div className="space-y-4">
                    <p className="text-sm text-gray-500">{t('directDescription')}</p>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={directInput}
                            onChange={e => setDirectInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={t('directPlaceholder')}
                            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                        />
                        <button
                            onClick={handleDirectGenerate}
                            disabled={isSearching || !directInput.trim()}
                            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl shadow-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSearching ? <Spinner /> : t('generateButton')}
                        </button>
                    </div>

                    {/* 生成されたリンク */}
                    {generatedLink && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-green-600 text-lg">✅</span>
                                <span className="font-semibold text-green-800">{t('linkReady')}</span>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-green-100 break-all text-sm text-gray-700 font-mono">
                                {generatedLink}
                            </div>
                            <button
                                onClick={() => copyToClipboard(generatedLink)}
                                className="w-full px-4 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 active:scale-[0.98] transition-all"
                            >
                                📋 {t('copyLink')}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================
// 商品カード サブコンポーネント
// ============================================

interface ProductCardProps {
    product: AmazonProduct;
    locale: string;
    isCopied: boolean;
    onCopy: () => void;
    renderStars: (rating: number | null) => React.ReactNode;
    t: ReturnType<typeof useTranslations<'Recommendations'>>;
}

function ProductCard({ product, locale, isCopied, onCopy, renderStars, t }: ProductCardProps) {
    return (
        <div className="flex gap-3 bg-white rounded-xl border border-gray-200 p-3 hover:shadow-md transition-shadow">
            {/* 商品画像 */}
            {product.imageUrl && (
                <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gray-50"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-full h-full object-contain"
                        loading="lazy"
                    />
                </a>
            )}

            {/* 商品情報 */}
            <div className="flex-1 min-w-0 space-y-1">
                <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-gray-900 hover:text-orange-600 line-clamp-2 transition-colors"
                >
                    {product.title}
                </a>

                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {product.brand && <span className="font-medium">{product.brand}</span>}
                    {product.category && (
                        <span className="bg-gray-100 px-2 py-0.5 rounded-full">{product.category}</span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {product.price && (
                        <span className="text-lg font-black text-red-600">{product.price}</span>
                    )}
                    {renderStars(product.rating)}
                    {product.totalReviews !== null && (
                        <span className="text-xs text-gray-400">({product.totalReviews})</span>
                    )}
                </div>

                {/* アクションボタン */}
                <div className="flex gap-2 pt-1">
                    <a
                        href={product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg hover:shadow-md active:scale-[0.98] transition-all"
                    >
                        🛒 Amazon{locale === 'ja' ? 'で見る' : ''}
                    </a>
                    <button
                        onClick={onCopy}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            isCopied
                                ? 'bg-green-100 text-green-700 border border-green-300'
                                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                        }`}
                    >
                        {isCopied ? '✅' : '📋'} {t(isCopied ? 'copied' : 'copyLink')}
                    </button>
                </div>
            </div>
        </div>
    );
}
