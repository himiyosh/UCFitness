'use client';

import { useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';

// ============================================
// ExportButton — データエクスポート UI
// 歩数データ・UC取引履歴を CSV/JSON でダウンロード
// Settings ページのサイドバーに配置
// ============================================

type ExportType = 'steps' | 'transactions';
type ExportFormat = 'csv' | 'json';

/**
 * 今日の日付を YYYY-MM-DD 形式で返す
 */
function getToday(): string {
    return new Date().toISOString().split('T')[0];
}

/**
 * N日前の日付を YYYY-MM-DD 形式で返す
 */
function getDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

export default function ExportButton() {
    const t = useTranslations('Export');

    const [exportType, setExportType] = useState<ExportType>('steps');
    const [format, setFormat] = useState<ExportFormat>('csv');
    const [period, setPeriod] = useState<'30' | '90' | '365'>('30');
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // 期間の選択肢
    const periodOptions = useMemo(() => [
        { value: '30' as const, label: t('last30days') },
        { value: '90' as const, label: t('last90days') },
        { value: '365' as const, label: t('last365days') },
    ], [t]);

    const handleExport = useCallback(async () => {
        setIsExporting(true);
        setError(null);
        setSuccess(false);

        try {
            const from = getDaysAgo(Number(period));
            const to = getToday();
            const url = `/api/user/export?type=${exportType}&format=${format}&from=${from}&to=${to}`;

            const res = await fetch(url);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Export failed');
            }

            // レスポンスからファイルをダウンロード
            const blob = await res.blob();
            const contentDisposition = res.headers.get('Content-Disposition') || '';
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            const filename = filenameMatch
                ? filenameMatch[1]
                : `ucfitness-${exportType}-${from}.${format}`;

            // ダウンロードリンクを生成して自動クリック
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);

            setSuccess(true);
            // 3秒後に成功メッセージを消す
            setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsExporting(false);
        }
    }, [exportType, format, period]);

    return (
        <section className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-4">
                <span>📥</span>
                <span>{t('title')}</span>
            </h3>
            <p className="text-xs text-gray-500 mb-4">{t('description')}</p>

            {/* データ種別 */}
            <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('dataType')}</label>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setExportType('steps')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all min-h-[44px] ${
                            exportType === 'steps'
                                ? 'bg-[var(--theme-primary)] text-white shadow-sm'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        🚶 {t('steps')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setExportType('transactions')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all min-h-[44px] ${
                            exportType === 'transactions'
                                ? 'bg-[var(--theme-primary)] text-white shadow-sm'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        💰 {t('transactions')}
                    </button>
                </div>
            </div>

            {/* 期間 */}
            <div className="mb-3">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('period')}</label>
                <div className="flex gap-1.5">
                    {periodOptions.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPeriod(opt.value)}
                            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all min-h-[44px] ${
                                period === opt.value
                                    ? 'bg-[var(--theme-primary-light)] text-[var(--theme-primary)] border border-[var(--theme-primary)]/30'
                                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* フォーマット */}
            <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t('format')}</label>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setFormat('csv')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all min-h-[44px] ${
                            format === 'csv'
                                ? 'bg-[var(--theme-primary-light)] text-[var(--theme-primary)] border border-[var(--theme-primary)]/30'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                    >
                        📄 CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => setFormat('json')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all min-h-[44px] ${
                            format === 'json'
                                ? 'bg-[var(--theme-primary-light)] text-[var(--theme-primary)] border border-[var(--theme-primary)]/30'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                    >
                        {'{ }'} JSON
                    </button>
                </div>
            </div>

            {/* エクスポートボタン */}
            <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] text-white font-semibold text-sm hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 min-h-[44px] flex items-center justify-center gap-2"
            >
                {isExporting ? (
                    <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        {t('exporting')}
                    </>
                ) : (
                    <>📥 {t('exportButton')}</>
                )}
            </button>

            {/* 成功メッセージ */}
            {success && (
                <p className="mt-2 text-xs text-green-600 font-medium flex items-center gap-1">
                    ✅ {t('exportSuccess')}
                </p>
            )}

            {/* エラーメッセージ */}
            {error && (
                <p className="mt-2 text-xs text-red-500 font-medium flex items-center gap-1">
                    ❌ {error}
                </p>
            )}
        </section>
    );
}
