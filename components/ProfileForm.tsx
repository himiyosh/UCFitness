'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ProfileFormProps {
    initialName: string;
}

export default function ProfileForm({ initialName }: ProfileFormProps) {
    const [name, setName] = useState(initialName);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const router = useRouter();

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setMessage(null);

        try {
            const response = await fetch('/api/user/profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name }),
            });

            if (!response.ok) {
                throw new Error('Failed to update profile');
            }

            setMessage({ text: 'Profile updated successfully!', type: 'success' });
            router.refresh(); // Refresh server components to show new name in header/dashboard
        } catch (error) {
            console.error(error);
            setMessage({ text: 'Failed to save changes.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave}>
            <label htmlFor="name" className="block text-sm font-medium leading-6 text-gray-900">
                Display Name
            </label>
            <div className="mt-2 text-sm text-gray-500 mb-4">
                This name will be visible to other participants in the leaderboard.
            </div>

            <div className="flex gap-4">
                <input
                    type="text"
                    name="name"
                    id="name"
                    required
                    maxLength={50}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 max-w-md"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save'}
                </button>
            </div>

            {message && (
                <p className={`mt-2 text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                    {message.text}
                </p>
            )}
        </form>
    );
}
