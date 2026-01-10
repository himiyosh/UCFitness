'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function GroupSettings() {
  const [keyword, setKeyword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const router = useRouter();

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

      setMessage({ text: `Joined group: ${keyword}`, type: 'success' });
      setKeyword('');
      router.refresh();
    } catch (error) {
      console.error(error);
      setMessage({ text: 'Failed to join group.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
      <div className="px-6 py-5">
        <h3 className="text-base font-bold text-gray-900">Join a Group</h3>
        <p className="mt-1 text-xs text-gray-500">
          Enter a group name to see its ranking.
        </p>
        <div className="mt-4 flex gap-2">
          <label htmlFor="keyword" className="sr-only">
            Group Name
          </label>
          <input
            type="text"
            name="keyword"
            id="keyword"
            className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
            placeholder="group-name"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button
            type="button"
            onClick={handleJoin}
            disabled={isSaving || !keyword.trim()}
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 whitespace-nowrap"
          >
            {isSaving ? '...' : 'Join'}
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
