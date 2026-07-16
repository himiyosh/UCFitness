'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useTranslations } from 'next-intl';

interface Props {
    groupKeyword: string;
    groupName: string;
}

export default function DeleteGroupButton({ groupKeyword, groupName }: Props) {
    const [isConfirming, setIsConfirming] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const t = useTranslations('EditGroup');

    const handleDelete = async () => {
        if (!confirmText || confirmText !== groupName) {
            return;
        }

        setError(null);
        setIsThinking(true);
        try {
            const res = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete_group',
                    keyword: groupKeyword
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to delete group');
            }

            // Redirect to Groups
            router.push('/groups');
            router.refresh();

        } catch {
            setError(t('deleteFailed'));
            setIsThinking(false);
        }
    };

    if (isConfirming) {
        return (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mt-6">
                <h3 className="text-red-800 font-bold mb-2">{t('deleteGroup')}</h3>
                <p className="text-red-600 text-sm mb-4">
                    {t('deleteWarning')}
                </p>
                <div className="mb-4">
                    <label className="block text-xs font-bold text-red-700 mb-1">
                        {t('typeToConfirm', { name: groupName })}
                    </label>
                    <input
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        className="min-h-[44px] w-full rounded-lg border border-red-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500"
                        placeholder={groupName}
                    />
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleDelete}
                        disabled={isThinking || confirmText !== groupName}
                        className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:bg-red-300"
                    >
                        {isThinking && (
                            <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                        )}
                        {isThinking ? t('deleting') : t('deleteGroup')}
                    </button>
                    <button
                        onClick={() => { setIsConfirming(false); setConfirmText(''); setError(null); }}
                        disabled={isThinking}
                        className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {t('cancel')}
                    </button>
                </div>
                {error && (
                    <p className="text-red-600 text-xs mt-2" role="alert">{error}</p>
                )}
            </div>
        );
    }

    return (
        <div className="pt-6 border-t border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 mb-2">{t('dangerZone')}</h3>
            <p className="text-xs text-gray-500 mb-4">
                {t('dangerZoneDescription')}
            </p>
            <button
                onClick={() => setIsConfirming(true)}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 hover:text-red-800"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                {t('deleteThisGroup')}
            </button>
        </div>
    );
}
