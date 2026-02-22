'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/navigation';

// ============================================
// PersonalizedGear — 歩数連動パーソナライズド Amazon レコメンド
// ユーザーのランク+平均歩数に応じたギアを提案
// トップヒット商品画像を表示して視覚的に訴求
// ============================================

interface PersonalizedData {
    rank: string;
    rankLabel: string;
    rankIcon: string;
    avgSteps: number;
    primaryKeyword: string;
    secondaryKeyword: string;
}

/** Amazon 検索結果の商品候補 */
interface ProductCandidate {
    asin: string;
    title: string;
    imageUrl: string;
    affiliateLink: string;
}

/** キーワードごとの商品候補 */
interface KeywordProduct {
    keyword: string;
    product: ProductCandidate | null;
}

export default function PersonalizedGear() {
    const t = useTranslations('Recommendations');
    const [data, setData] = useState<PersonalizedData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [products, setProducts] = useState<KeywordProduct[]>([]);

    // Amazon 検索URLを生成（アフィリエイトタグ付き）
    const associateTag = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG || 'ucfitness-22';
    const makeSearchUrl = useCallback((keyword: string) =>
        `https://www.amazon.co.jp/s?k=${encodeURIComponent(keyword)}&tag=${associateTag}`,
    [associateTag]);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/amazon/personalized')
            .then(res => {
                if (!res.ok) throw new Error('fetch failed');
                return res.json();
            })
            .then(json => {
                if (!cancelled) setData(json);
            })
            .catch(() => {
                // サイレントフェイル
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    // キーワードのトップヒット商品画像を取得
    useEffect(() => {
        if (!data) return;
        let cancelled = false;
        const keywords = [data.primaryKeyword, data.secondaryKeyword];

        Promise.all(
            keywords.map(async (keyword) => {
                try {
                    const res = await fetch('/api/amazon/search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ input: keyword, withCandidates: true }),
                    });
                    if (!res.ok) return { keyword, product: null };
                    const json = await res.json();
                    const candidates: ProductCandidate[] = json.candidates || [];
                    return { keyword, product: candidates[0] || null };
                } catch {
                    return { keyword, product: null };
                }
            })
        ).then(results => {
            if (!cancelled) setProducts(results);
        });

        return () => { cancelled = true; };
    }, [data]);

    if (isLoading) {
        return (
            <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="animate-pulse">
                    <div className="h-5 bg-gray-200 rounded w-48 mb-3" />
                    <div className="h-24 bg-gray-100 rounded-xl mb-2" />
                    <div className="h-24 bg-gray-100 rounded-xl" />
                </div>
            </div>
        );
    }

    if (!data) return null;

    // プライマリ・セカンダリのトップヒット商品
    const primaryProduct = products.find(p => p.keyword === data.primaryKeyword)?.product ?? null;
    const secondaryProduct = products.find(p => p.keyword === data.secondaryKeyword)?.product ?? null;

    /** キーワード行の共通レンダリング — 商品画像がある場合は画像付きカード */
    const renderKeywordCard = (
        keyword: string,
        emoji: string,
        label: string,
        product: ProductCandidate | null,
    ) => {
        // 商品画像がある場合 → 画像付きリッチカード
        if (product) {
            return (
                <a
                    href={product.affiliateLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-[var(--theme-primary)]/30 hover:shadow-md transition-all group"
                >
                    <div className="w-16 h-16 rounded-lg bg-white border border-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={product.imageUrl}
                            alt={product.title || keyword}
                            className="max-w-[90%] max-h-[90%] object-contain"
                            loading="lazy"
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-gray-800 group-hover:text-[var(--theme-primary)] transition-colors truncate">
                            {keyword}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{emoji} {label}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-[var(--theme-primary)] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                </a>
            );
        }

        // 画像なし → 従来のテキストカード（フォールバック）
        return (
            <a
                href={makeSearchUrl(keyword)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-[var(--theme-primary)]/30 hover:shadow-sm transition-all group"
            >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg" style={{ background: 'var(--theme-primary-light)' }}>
                    {emoji}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-gray-800 group-hover:text-[var(--theme-primary)] transition-colors truncate">
                        {keyword}
                    </p>
                    <p className="text-xs text-gray-400">{label}</p>
                </div>
                <svg className="w-4 h-4 text-gray-400 group-hover:text-[var(--theme-primary)] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
            </a>
        );
    };

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow h-full flex flex-col">
            <div className="px-5 pt-5 pb-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        🎁 {t('personalizedTitle')}
                    </h3>
                    <span className="text-xs font-medium text-gray-400">
                        {data.rankIcon} {data.rankLabel}
                    </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                    {t('personalizedDesc', { steps: data.avgSteps.toLocaleString() })}
                </p>
            </div>

            <div className="px-5 pb-5 space-y-2 flex-1">
                {/* プライマリーキーワード（ランク別）— トップヒット商品画像付き */}
                {renderKeywordCard(data.primaryKeyword, '🏃', t('rankRecommend'), primaryProduct)}

                {/* セカンダリーキーワード（歩数別）— トップヒット商品画像付き */}
                {renderKeywordCard(data.secondaryKeyword, '👟', t('stepsRecommend'), secondaryProduct)}

                {/* ショップリンク */}
                <div className="text-center pt-1">
                    <Link href="/shop?view=gear" className="text-xs font-semibold text-[var(--theme-primary)] hover:underline">
                        🛍️ {t('viewShop')}
                    </Link>
                </div>
            </div>
        </div>
    );
}
