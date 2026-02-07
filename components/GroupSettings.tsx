'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function GroupSettings() {
  const [keyword, setKeyword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const router = useRouter();
  const t = useTranslations('Groups');

  const handleJoin = async () => {
    if (!keyword.trim()) return;

    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/user/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', keyword: keyword }),
      });

      if (!response.ok) {
        throw new Error('Failed to join group');
      }

      setMessage({ text: t('success', { keyword }), type: 'success' });
      setKeyword('');
      router.refresh();
    } catch (error) {
      console.error(error);
      setMessage({ text: t('error'), type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
      <div className="px-6 py-5">
        <h3 className="text-base font-bold text-gray-900">{t('joinGroup')}</h3>
        <p className="mt-1 text-xs text-gray-500">
          {t('enterGroupName')}
        </p>
        <div className="mt-4 flex gap-2">
          <label htmlFor="keyword" className="sr-only">
            Group Name
          </label>
          <input
            type="text"
            name="keyword"
            id="keyword"
            className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-[var(--theme-primary)] sm:text-sm sm:leading-6"
            placeholder={t('placeholder')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button
            type="button"
            onClick={handleJoin}
            disabled={isSaving || !keyword.trim()}
            className="inline-flex items-center rounded-md bg-[var(--theme-primary)] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--theme-primary)]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-primary)] disabled:opacity-50 whitespace-nowrap gap-2"
          >
            {isSaving && (
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {isSaving ? t('joining') : t('join')}
          </button>
        </div>
        {
          message && (
            <p className={`mt-2 text-xs ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {message.text}
            </p>
          )
        }
      </div >
    </div >
  );
}
