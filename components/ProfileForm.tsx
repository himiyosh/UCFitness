'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface ProfileFormProps {
    initialName: string;
}

export default function ProfileForm({ initialName }: ProfileFormProps) {
    const [name, setName] = useState(initialName);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const t = useTranslations('Common');

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) {
            setMessage({ text: t('saveFailed'), type: 'error' });
            return;
        }
        setIsSaving(true);
        setMessage(null);

        try {
            const response = await fetch('/api/user/profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: trimmed }),
            });

            if (!response.ok) {
                throw new Error('Failed to update profile');
            }

            setMessage({ text: t('updated'), type: 'success' });
            window.location.reload();
        } catch {
            setMessage({ text: t('saveFailed'), type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="w-full">
            <div className="flex gap-2 items-center flex-wrap">
                <label htmlFor="profile-name" className="sr-only">{t('displayName')}</label>
                <input
                    type="text"
                    name="name"
                    id="profile-name"
                    required
                    maxLength={50}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[var(--theme-primary)] sm:text-sm sm:leading-6"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('displayName')}
                    aria-label={t('displayName')}
                />
                <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-lg bg-[var(--theme-primary)] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50 whitespace-nowrap transition-all flex items-center gap-1.5"
                >
                    {isSaving && (
                        <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    )}
                    {t('save')}
                </button>
            </div>
            {message && (
                <p className={`mt-1 text-xs ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                    {message.text}
                </p>
            )}
        </form>
    );
}
