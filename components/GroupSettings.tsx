'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface GroupSettingsProps {
  initialKeyword: string | null;
}

export default function GroupSettings({ initialKeyword }: GroupSettingsProps) {
  const [keyword, setKeyword] = useState(initialKeyword || '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const router = useRouter();

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/user/group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ group_keyword: keyword }),
      });

      if (!response.ok) {
        throw new Error('Failed to update group keyword');
      }

      setMessage({ text: 'Group keyword updated!', type: 'success' });
      router.refresh();
    } catch (error) {
      console.error(error);
      setMessage({ text: 'Failed to save changes.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mb-8 overflow-hidden rounded-lg bg-white shadow">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg font-medium leading-6 text-gray-900">Group Settings</h3>
        <div className="mt-2 max-w-xl text-sm text-gray-500">
          <p>Enter a keyword to compete with others in a private group. Leave empty to see the global leaderboard.</p>
        </div>
        <div className="mt-5 sm:flex sm:items-center">
          <div className="w-full sm:max-w-xs">
            <label htmlFor="keyword" className="sr-only">
              Group Keyword
            </label>
            <input
              type="text"
              name="keyword"
              id="keyword"
              className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              placeholder="e.g. 'office-team'"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:ml-3 sm:mt-0 sm:w-auto disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
        {message && (
          <p className={`mt-2 text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
