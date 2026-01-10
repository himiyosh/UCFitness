'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface UsernameFormProps {
    initialUsername?: string;
    isOnboarding?: boolean;
}

export default function UsernameForm({ initialUsername = '', isOnboarding = false }: UsernameFormProps) {
    const [username, setUsername] = useState(initialUsername);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const router = useRouter();

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setMessage(null);

        try {
            const response = await fetch('/api/user/username', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update User ID');
            }

            setMessage({ text: 'User ID updated successfully!', type: 'success' });

            if (isOnboarding) {
                router.replace('/'); // Go to dashboard after onboarding
            } else {
                router.refresh();
            }
        } catch (error: any) {
            console.error(error);
            setMessage({ text: error.message || 'Failed to save changes.', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="space-y-6">
            <div>
                <label htmlFor="username" className="block text-sm font-medium leading-6 text-gray-900">
                    User ID {isOnboarding ? '(Required)' : ''}
                </label>
                <div className="mt-2">
                    <input
                        type="text"
                        name="username"
                        id="username"
                        required
                        pattern="[a-zA-Z0-9_]+"
                        title="Only letters, numbers, and underscores allowed."
                        maxLength={20}
                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                        placeholder="e.g. user_123"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                    Unique ID used for identification. Letters, numbers, and underscores only.
                </p>
            </div>

            <div>
                <button
                    type="submit"
                    disabled={isSaving}
                    className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : (isOnboarding ? 'Get Started' : 'Update User ID')}
                </button>
            </div>

            {message && (
                <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                    {message.text}
                </p>
            )}
        </form>
    );
}
